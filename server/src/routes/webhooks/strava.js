const express = require('express');
const db = require('../../db');
const config = require('../../config');
const { hmac } = require('../../lib/crypto');
const { timingSafeEqualStr } = require('../../lib/timing');
const strava = require('../../services/strava');
const { importStravaActivity } = require('../../services/stravaImport');
const { getActiveChallenge } = require('../../services/challengeWindow');
const { getValidAccessToken } = require('../../services/stravaSync');
const { totalForEnrollment } = require('../../services/progress');
const { emitProgressEvents, sendActivityConfirm } = require('../../services/progressEvents');
const { enqueue } = require('../../services/queue');
const { logEvent } = require('../../services/logger');
const { AppError } = require('../../middleware/errors');

const router = express.Router();

router.use(express.raw({ type: 'application/json' }));

function verifySignature(req) {
  const sig = req.get('X-Hub-Signature') || '';
  // Prefer the exact raw bytes (stashed by express.json's verify hook); fall
  // back to whatever body we have.
  const raw = req.rawBody
    ? req.rawBody.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || '');
  const expected = 'sha1=' + hmac(config.strava.clientSecret, raw);
  return timingSafeEqualStr(sig, expected);
}

router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query;
  if (mode === 'subscribe' && timingSafeEqualStr(String(verifyToken || ''), String(config.strava.verifyToken || ''))) {
    return res.json({ 'hub.challenge': challenge });
  }
  return res.status(403).json({ error: 'Verification failed' });
});

router.post('/', (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : null;
    event = raw ? JSON.parse(raw) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Retries are safe here: importStravaActivity upserts by strava_activity_id
  // and emitProgressEvents only fills unreached milestones / flips the finish
  // atomically, so a retried event can't double-apply. maxAttempts=3 gives a
  // transient rate-limit or token refresh a chance instead of dropping the
  // activity (Strava will not redeliver — we already ACKed 200).
  enqueue(() => handleEvent(event), { maxAttempts: 3 });
  logEvent({
    source: 'webhook',
    type: 'strava_event',
    message: `strava ${event.aspect_type} ${event.object_type}`,
    meta: { aspect: event.aspect_type, objectType: event.object_type }
  });
  res.json({ ok: true });
});

async function findEnrollmentByAthlete(athleteId) {
  const conn = await db('strava_connections').where({ strava_athlete_id: athleteId }).first();
  if (!conn) return null;
  const enrollment = await db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': conn.user_id, 'challenges.is_active': true })
    .select('enrollments.*')
    .first();
  return { conn, enrollment };
}

async function handleEvent(event) {
  const aspect = event.aspect_type; // create | update | delete
  const objectType = event.object_type; // activity | athlete
  const athleteId = event.owner_id || event.athlete_id;

  // Strava sends `authorized` as the STRING "false" (not a boolean) when an
  // athlete revokes access from their own settings — accept both forms.
  const authorized = event.updates?.authorized;
  if (objectType === 'athlete' && aspect === 'update' && (authorized === false || authorized === 'false')) {
    await db('strava_connections')
      .where({ strava_athlete_id: athleteId })
      .update({
        status: 'disconnected',
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        disconnected_at: db.fn.now(),
        updated_at: db.fn.now()
      });
    return;
  }

  if (objectType !== 'activity') return;

  const { conn, enrollment } = await findEnrollmentByAthlete(athleteId);
  if (!conn || !enrollment) return;

  if (aspect === 'delete') {
    await db('challenge_activities').where({ strava_activity_id: event.object_id }).del();
    return;
  }

  if (aspect === 'create' || aspect === 'update') {
    const challenge = await getActiveChallenge();
    const accessToken = await getAccessToken(conn);
    if (!accessToken) return;
    const activity = await strava.fetchActivity(accessToken, event.object_id);
    const result = await importStravaActivity(enrollment, activity, event.object_id, challenge);

    if (result.imported) {
      // Keep the connection's last_synced_at fresh so a bulk sync resumes cleanly
      // instead of re-fetching from an old cutoff.
      await db('strava_connections').where({ id: conn.id }).update({ last_synced_at: db.fn.now() });
      const total = await totalForEnrollment(enrollment.id);
      const user = await db('users').where({ id: conn.user_id }).first();
      await emitProgressEvents({ enrollment, total, user: user || { id: conn.user_id }, added: result.quantity || 0 });
      if (user) await sendActivityConfirm({ user, enrollment, added: result.quantity || 0, total });
    }
  }
}

async function getAccessToken(conn) {
  // Shared with the bulk/periodic sync path — one implementation for refresh,
  // expiry, and encrypted-token handling everywhere.
  try {
    return await getValidAccessToken(conn);
  } catch (err) {
    // Unreadable/expired tokens (e.g. ENCRYPTION_KEY changed) can never sync —
    // mark the connection disconnected so the member reconnects instead of
    // silently failing forever.
    console.error('Strava webhook token error:', err.message);
    await db('strava_connections')
      .where({ id: conn.id })
      .update({ status: 'disconnected', updated_at: db.fn.now() });
    return null;
  }
}

module.exports = router;