const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireAuth);

// The application server key the client needs to create a subscription.
router.get(
  '/vapid-public-key',
  asyncHandler(async (req, res) => {
    res.json({ publicKey: config.vapid.publicKey || null });
  })
);

// Upsert a browser push subscription (keyed by endpoint).
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const sub = (req.body && req.body.subscription) || {};
    const endpoint = String(sub.endpoint || '').slice(0, 500);
    const p256dh = String((sub.keys && sub.keys.p256dh) || '').slice(0, 255);
    const auth = String((sub.keys && sub.keys.auth) || '').slice(0, 255);
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    await db('push_subscriptions')
      .insert({ user_id: req.user.id, endpoint, p256dh, auth })
      .onConflict('endpoint')
      .merge({ user_id: req.user.id, p256dh, auth, updated_at: db.fn.now() });
    res.json({ message: 'Subscribed' });
  })
);

// Remove a subscription by endpoint (user revoked / re-subscribed elsewhere).
router.delete(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const endpoint = String((req.body && req.body.endpoint) || (req.query && req.query.endpoint) || '').slice(0, 500);
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    await db('push_subscriptions').where({ endpoint }).del();
    res.json({ message: 'Unsubscribed' });
  })
);

module.exports = router;