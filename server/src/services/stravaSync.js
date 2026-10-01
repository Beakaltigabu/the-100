const db = require('../db');
const strava = require('./strava');
const { importStravaActivity } = require('./stravaImport');
const stravaRateLimit = require('./stravaRateLimit');
const { getActiveChallenge } = require('./challengeWindow');
const { decrypt } = require('../lib/crypto');
const { totalForEnrollment } = require('./progress');
const { emitProgressEvents, sendActivityConfirm } = require('./progressEvents');

const PAGE_SIZE = 50;
const MAX_SYNC_PAGES = 10;

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

// Earliest point a sync may fetch from, as unix seconds. The latest of:
//  - midnight of the last successful sync (incremental)
//  - the challenge start day (so syncing begins at the launch, e.g. 2026-09-23)
//  - the day the member connected
// Falls back to "now" when none apply. Pure — used by syncStrava and unit tests.
function resolveSyncAfter({ lastSyncedAt, connectedAt, challengeStartDate } = {}) {
  const floors = [];
  if (lastSyncedAt) {
    const d = new Date(lastSyncedAt);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      floors.push(d.getTime());
    }
  }
  if (challengeStartDate) {
    const d = new Date(`${challengeStartDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) floors.push(d.getTime());
  }
  // `connectedAt` is intentionally NOT a floor: the initial backfill always
  // starts at the challenge start so every member's full challenge window is
  // imported, even if they connected to Strava after launch. Incremental syncs
  // resume from `lastSyncedAt`.
  const base = floors.length ? new Date(Math.max(...floors)) : new Date();
  return Math.floor(base.getTime() / 1000);
}

// Sync a member's Strava activities into THE 100. The cutoff defaults to the
// latest of {last sync, challenge start, connection day}, so first syncs pull
// the whole challenge window (from 2026-09-23) and later syncs resume
// incrementally. Imports are idempotent (upsert by strava_activity_id).
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

  const challenge = await getActiveChallenge();
  if (!after) {
    after = resolveSyncAfter({
      lastSyncedAt: conn.last_synced_at,
      connectedAt: conn.connected_at,
      challengeStartDate: challenge ? challenge.start_date : null
    });
  }

  let accessToken;
  try {
    accessToken = await getValidAccessToken(conn);
  } catch (err) {
    // Unreadable/expired tokens (e.g. ENCRYPTION_KEY changed) can never sync —
    // mark the connection disconnected so the member reconnects instead of
    // silently failing forever.
    console.error(`Strava token error for user ${userId}:`, err.message);
    await db('strava_connections')
      .where({ user_id: userId })
      .update({ status: 'disconnected', updated_at: db.fn.now() });
    return { imported: 0, total: 0, rateLimited: false };
  }
  if (!accessToken) return { imported: 0, total: 0, rateLimited: false };

  let imported = 0;
  let total = 0;
  let before = null;
  const totalBefore = await totalForEnrollment(enrollment.id);
  try {
    // Page through every activity in the window (Strava returns newest first).
    for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
      const activities = await strava.fetchRecentActivities(accessToken, {
        after,
        before: before || undefined,
        perPage: PAGE_SIZE
      });
      if (!activities.length) break;
      const batch = activities.length;
      for (const a of activities) {
        try {
          const r = await importStravaActivity(enrollment, a, a.id, challenge);
          if (r.imported) imported += 1;
        } catch (err) {
          if (err instanceof stravaRateLimit.RateLimitedError) {
            return { imported, total: total + batch, rateLimited: true };
          }
          console.error('Strava sync import error:', err.message);
        }
      }
      total += batch;
      const oldest = activities[activities.length - 1];
      before = Math.floor(new Date(oldest.start_date).getTime() / 1000) - 1;
      if (batch < PAGE_SIZE) break;
    }

    await db('strava_connections').where({ user_id: userId }).update({ last_synced_at: db.fn.now() });

    // Award milestones / complete the enrollment for everything just imported
    // (the webhook path already does this; the bulk/periodic path must too).
    if (imported > 0) {
      const totalValue = await totalForEnrollment(enrollment.id);
      const user = await db('users').where({ id: userId }).first();
      await emitProgressEvents({ enrollment, total: totalValue, user: user || { id: userId }, added: totalValue - totalBefore });
      if (user) await sendActivityConfirm({ user, enrollment, added: totalValue - totalBefore, total: totalValue });
    }

    return { imported, total, rateLimited: false };
  } catch (err) {
    if (err instanceof stravaRateLimit.RateLimitedError) {
      return { imported, total, rateLimited: true };
    }
    throw err;
  }
}

// One-time backfill after Strava connects (uses the challenge-start cutoff).
async function backfillRecent(userId) {
  const result = await syncStrava(userId);
  console.log(`Strava backfill: imported ${result.imported} activities for user ${userId}`);
  return result;
}

module.exports = { getValidAccessToken, resolveSyncAfter, syncStrava, backfillRecent };