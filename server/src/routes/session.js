const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();
router.use(requireAuth);

// Maximum gap between heartbeats counted as continuous active time.
const HEARTBEAT_GAP_MS = 3 * 60 * 1000;

// Client sends a heartbeat every ~60s while the app is open. We accumulate the
// elapsed time (capped at the gap) into the open session so "time on platform"
// is accurate without trusting an end-of-session signal (which is unreliable on
// the web).
router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const sessionId = String((req.body && req.body.session_id) || '').slice(0, 64);
    if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

    const now = new Date();
    const open = await db('session_logs')
      .where({ user_id: req.user.id, session_id: sessionId })
      .where('last_heartbeat_at', '>=', new Date(now - HEARTBEAT_GAP_MS))
      .orderBy('last_heartbeat_at', 'desc')
      .first();

    if (open) {
      const delta = Math.min(now - new Date(open.last_heartbeat_at), HEARTBEAT_GAP_MS);
      await db('session_logs').where({ id: open.id }).update({
        last_heartbeat_at: now,
        duration_seconds: Number(open.duration_seconds) + Math.round(delta / 1000)
      });
    } else {
      await db('session_logs').insert({
        user_id: req.user.id,
        session_id: sessionId,
        started_at: now,
        last_heartbeat_at: now,
        duration_seconds: 0
      });
    }
    res.json({ ok: true });
  })
);

// One-time PWA-install report: the client calls this when it detects it's
// running in a standalone (installed) window.
router.post(
  '/installed',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.user.id }).first();
    if (user && !user.pwa_installed) {
      await db('users').where({ id: user.id }).update({
        pwa_installed: true,
        installed_at: user.installed_at || db.fn.now()
      });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
