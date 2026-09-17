const express = require('express');
const db = require('../../db');
const config = require('../../config');
const { requireAuth, verifyToken, signToken } = require('../../middleware/auth');
const { asyncHandler, AppError } = require('../../middleware/errors');
const strava = require('../../services/strava');
const { decrypt } = require('../../lib/crypto');
const { getValidAccessToken, backfillRecent } = require('../../services/stravaSync');

const router = express.Router();

function getStoredConnection(userId) {
  return db('strava_connections').where({ user_id: userId }).first();
}

function sanitizeReturn(v) {
  if (!v || typeof v !== 'string') return '/profile?strava=connected';
  if (!v.startsWith('/') || v.startsWith('//')) return '/profile?strava=connected';
  return v;
}

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!strava.configured()) {
      return res.json({ configured: false, connected: false });
    }
    const conn = await getStoredConnection(req.user.id);
    if (!conn || conn.status !== 'connected') {
      return res.json({ configured: true, connected: false });
    }
    res.json({
      configured: true,
      connected: true,
      athleteId: conn.strava_athlete_id,
      scope: conn.scope,
      connectedAt: conn.connected_at
    });
  })
);

router.get(
  '/connect',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!strava.configured()) {
      throw new AppError('Strava integration is not configured', 503);
    }
    const state = signToken({ sub: req.user.id, purpose: 'strava_oauth', returnTo: sanitizeReturn(req.query.returnTo) });
    res.json({ url: strava.authorizeUrl(state) });
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      throw new AppError(`Strava authorization denied: ${error}`, 400);
    }
    if (!code || !state) {
      throw new AppError('Missing code or state', 400);
    }
    let payload;
    try {
      payload = verifyToken(state);
    } catch {
      throw new AppError('Invalid OAuth state', 400);
    }
    const userId = payload.sub;

    const tokens = await strava.exchangeCode(code);
    const encrypted = strava.persistTokens(userId, tokens);

    let conn = await db('strava_connections').where({ user_id: userId }).first();
    if (conn) {
      await db('strava_connections')
        .where({ user_id: userId })
        .update({
          ...encrypted,
          status: 'connected',
          connected_at: db.fn.now(),
          disconnected_at: null,
          updated_at: db.fn.now()
        });
    } else {
      await db('strava_connections').insert({
        user_id: userId,
        ...encrypted,
        status: 'connected',
        connected_at: db.fn.now()
      });
    }

    const redirect = `${config.clientOrigin}${payload.returnTo || '/profile?strava=connected'}`;

    const saved = await getStoredConnection(userId);
    if (!saved.last_synced_at) {
      await backfillRecent(userId).catch((err) => console.error('Strava backfill error:', err.message));
    }

    res.redirect(redirect);
  })
);

router.post(
  '/disconnect',
  requireAuth,
  asyncHandler(async (req, res) => {
    const conn = await getStoredConnection(req.user.id);
    if (conn && conn.status === 'connected') {
      try {
        const token = decrypt(conn.encrypted_access_token);
        await strava.deauthorize(token);
      } catch (err) {
        // continue with local cleanup even if remote revocation fails
      }
    }

    await db('strava_connections')
      .where({ user_id: req.user.id })
      .update({
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        token_expires_at: null,
        strava_athlete_id: null,
        scope: null,
        status: 'disconnected',
        disconnected_at: db.fn.now(),
        updated_at: db.fn.now()
      });

    await db('challenge_activities').where({ source: 'strava' }).del();

    res.json({ message: 'Strava disconnected' });
  })
);

router.get(
  '/activities',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enrollment = await db('enrollments')
      .join('challenges', 'challenges.id', 'enrollments.challenge_id')
      .where({ 'enrollments.user_id': req.user.id, 'challenges.is_active': true })
      .first();
    if (!enrollment) {
      return res.json({ activities: [] });
    }
    const activities = await db('challenge_activities')
      .where({ enrollment_id: enrollment.id, source: 'strava' })
      .orderBy('date', 'desc')
      .limit(100);
    res.json({ activities });
  })
);

module.exports = router;