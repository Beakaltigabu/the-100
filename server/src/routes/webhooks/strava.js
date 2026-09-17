const express = require('express');
const db = require('../../db');
const config = require('../../config');
const { hmac, decrypt } = require('../../lib/crypto');
const { timingSafeEqualStr } = require('../../lib/timing');
const strava = require('../../services/strava');
const { importStravaActivity } = require('../../services/stravaImport');
const { getActiveChallenge, hasChallengeStarted } = require('../../services/challengeWindow');
const { totalForEnrollment } = require('../../services/progress');
const { syncMilestones } = require('../../services/milestones');
const { createNotification } = require('../../services/notifications');
const telegramMessenger = require('../../services/telegramMessenger');
const botMessages = require('../../services/botMessages');
const { unitForActivity, UNIT_LABEL } = require('../../constants');
const { enqueue } = require('../../services/queue');
const { AppError } = require('../../middleware/errors');

const router = express.Router();

router.use(express.raw({ type: 'application/json' }));

function verifySignature(req) {
  const sig = req.get('X-Hub-Signature') || '';
  const expected = 'sha1=' + hmac(config.strava.clientSecret, req.body.toString('utf8'));
  return timingSafeEqualStr(sig, expected);
}

router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query;
  if (mode === 'subscribe' && verifyToken === config.strava.verifyToken) {
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
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  enqueue(() => handleEvent(event), { maxAttempts: 3, delay: 60000 });
  res.json({ ok: true });
});

async function findEnrollmentByAthlete(athleteId) {
  const conn = await db('strava_connections').where({ strava_athlete_id: athleteId }).first();
  if (!conn) return null;
  const enrollment = await db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': conn.user_id, 'challenges.is_active': true })
    .first();
  return { conn, enrollment };
}

async function handleEvent(event) {
  const aspect = event.aspect_type; // create | update | delete
  const objectType = event.object_type; // activity | athlete
  const athleteId = event.owner_id || event.athlete_id;

  if (objectType === 'athlete' && aspect === 'update' && event.updates?.authorized === false) {
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
    if (!hasChallengeStarted(challenge)) return; // logging/sync opens at launch
    const accessToken = await getAccessToken(conn);
    if (!accessToken) return;
    const activity = await strava.fetchActivity(accessToken, event.object_id);
    const result = await importStravaActivity(enrollment, activity, event.object_id, challenge);

    if (result.imported) {
      const total = await totalForEnrollment(enrollment.id);
      const reached = await syncMilestones(enrollment.id, total);
      if (reached.length) {
        const user = await db('users').where({ id: conn.user_id }).first();
        const name = user ? user.name : 'Member';
        const lang = await telegramMessenger.getUserLanguage(conn.user_id);
        const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
        for (const threshold of reached) {
          await createNotification({
            userId: conn.user_id,
            type: 'milestone',
            title: `You just hit ${threshold} ${unitLabel}.`,
            body: `You reached the ${threshold} ${unitLabel} milestone. Keep moving.`
          });
          telegramMessenger.sendToUser(conn.user_id, botMessages.milestoneHit(lang, threshold, unitLabel));
          telegramMessenger.broadcastMilestone(name, threshold, unitLabel);
        }
      }
    }
  }
}

async function getAccessToken(conn) {
  try {
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (expiresAt > Date.now() + 60 * 1000) {
      return decrypt(conn.encrypted_access_token);
    }
    const refreshToken = decrypt(conn.encrypted_refresh_token);
    const tokens = await strava.refreshAccessToken(refreshToken);
    const encrypted = strava.persistTokens(conn.user_id, tokens);
    await db('strava_connections')
      .where({ id: conn.id })
      .update({
        encrypted_access_token: encrypted.encrypted_access_token,
        encrypted_refresh_token: encrypted.encrypted_refresh_token,
        token_expires_at: encrypted.token_expires_at,
        updated_at: db.fn.now()
      });
    return tokens.access_token;
  } catch (err) {
    console.error('Strava webhook token error:', err.message);
    return null;
  }
}

module.exports = router;