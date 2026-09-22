const db = require('../db');
const strava = require('./strava');
const { importStravaActivity } = require('./stravaImport');
const stravaRateLimit = require('./stravaRateLimit');
const { getActiveChallenge } = require('./challengeWindow');
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

// Sync a member's Strava activities into THE 100. The cutoff defaults to the
// start of the last sync day — or, on first sync, the day they connected — so
// syncing starts from the day they connect. Rate-limited and deduped.
// Returns { imported, total, rateLimited }.
async function syncStrava(userId, { after } = {}) {
  const conn = await db('strava_connections').where({ user_id: userId }).first();
  if (!conn || conn.status !== 'connected') return { imported: 0, total: 0, rateLimited: false };

  const enrollment = await db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': userId, 'challenges.is_active': true })
    .select('enrollments.*')
    .first();
  if (!enrollment) return { imported: 0, total: 0, rateLimited: false };

  if (!after) {
    const from = conn.last_synced_at || conn.connected_at;
    const d = from ? new Date(from) : new Date();
    d.setHours(0, 0, 0, 0);
    after = Math.floor(d.getTime() / 1000);
    // Never go before the connection day.
    if (conn.connected_at) {
      const connStart = new Date(conn.connected_at);
      connStart.setHours(0, 0, 0, 0);
      const connSec = Math.floor(connStart.getTime() / 1000);
      if (after < connSec) after = connSec;
    }
  }

  const accessToken = await getValidAccessToken(conn);
  if (!accessToken) return { imported: 0, total: 0, rateLimited: false };

  try {
    const challenge = await getActiveChallenge();
    const perPage = 50;
    const activities = await strava.fetchRecentActivities(accessToken, { after, perPage });
    let imported = 0;
    const fetchedIds = activities.map((a) => a.id);
    for (const a of activities) {
      try {
        const r = await importStravaActivity(enrollment, a, a.id, challenge);
        if (r.imported) imported += 1;
      } catch (err) {
        if (err instanceof stravaRateLimit.RateLimitedError) {
          return { imported, total: activities.length, rateLimited: true };
        }
        console.error('Strava sync import error:', err.message);
      }
    }

    // Reconcile deletions: if the fetch returned the full set (not truncated by
    // pagination), remove imported rows in this window that no longer exist on
    // Strava (the webhook covers this on prod; this is the safety net + local).
    if (activities.length < perPage) {
      const cutoffDate = new Date(after * 1000).toISOString().slice(0, 10);
      await db('challenge_activities')
        .where({ enrollment_id: enrollment.id, source: 'strava' })
        .where('date', '>=', cutoffDate)
        .whereNotIn('strava_activity_id', fetchedIds.length ? fetchedIds : [0])
        .del();
    }

    await db('strava_connections').where({ user_id: userId }).update({ last_synced_at: db.fn.now() });
    return { imported, total: activities.length, rateLimited: false };
  } catch (err) {
    if (err instanceof stravaRateLimit.RateLimitedError) {
      return { imported: 0, total: 0, rateLimited: true };
    }
    throw err;
  }
}

// One-time backfill after Strava connects (uses the connection-day cutoff).
async function backfillRecent(userId) {
  const result = await syncStrava(userId);
  console.log(`Strava backfill: imported ${result.imported} activities for user ${userId}`);
  return result;
}

module.exports = { getValidAccessToken, syncStrava, backfillRecent };