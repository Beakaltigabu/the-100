const db = require('../db');
const strava = require('./strava');
const { importStravaActivity } = require('./stravaImport');
const stravaRateLimit = require('./stravaRateLimit');
const { getActiveChallenge, hasChallengeStarted } = require('./challengeWindow');
const { decrypt } = require('../lib/crypto');

// Returns a valid (non-expired) access token for a connection, refreshing if needed.
async function getValidAccessToken(conn) {
  if (!conn || !conn.encrypted_access_token) return null;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60 * 1000) {
    return decrypt(conn.encrypted_access_token);
  }
  const refreshToken = decrypt(conn.encrypted_refresh_token);
  const tokens = await strava.refreshAccessToken(refreshToken);
  const encrypted = strava.persistTokens(conn.user_id, tokens);
  await db('strava_connections')
    .where({ user_id: conn.user_id })
    .update({
      encrypted_access_token: encrypted.encrypted_access_token,
      encrypted_refresh_token: encrypted.encrypted_refresh_token,
      token_expires_at: encrypted.token_expires_at,
      scope: encrypted.scope,
      strava_athlete_id: encrypted.strava_athlete_id || conn.strava_athlete_id,
      updated_at: db.fn.now()
    });
  return decrypt(encrypted.encrypted_access_token);
}

// One-time backfill of a member's recent activities (used after Strava connects,
// whether via CONNECT STRAVA or via Strava sign-in). Rate-limited and deduped.
async function backfillRecent(userId) {
  const conn = await db('strava_connections').where({ user_id: userId }).first();
  if (!conn || conn.status !== 'connected') return;

  // Don't sync anything before the challenge launches.
  const challenge = await getActiveChallenge();
  if (!hasChallengeStarted(challenge)) {
    console.log('Strava backfill skipped (challenge not started)');
    return;
  }

  const enrollment = await db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': userId, 'challenges.is_active': true })
    .first();
  if (!enrollment) return;

  const accessToken = await getValidAccessToken(conn);
  if (!accessToken) return;

  const after = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60; // last 14 days
  try {
    const activities = await strava.fetchRecentActivities(accessToken, { after, perPage: 50 });
    let imported = 0;
    for (const a of activities) {
      try {
        const r = await importStravaActivity(enrollment, a, a.id, challenge);
        if (r.imported) imported += 1;
      } catch (err) {
        if (err instanceof stravaRateLimit.RateLimitedError) break;
        console.error('Strava backfill import error:', err.message);
      }
    }
    await db('strava_connections').where({ user_id: userId }).update({ last_synced_at: db.fn.now() });
    console.log(`Strava backfill: imported ${imported} activities for user ${userId}`);
  } catch (err) {
    if (err instanceof stravaRateLimit.RateLimitedError) {
      console.log('Strava backfill deferred (rate limited)');
      return;
    }
    throw err;
  }
}

module.exports = { getValidAccessToken, backfillRecent };