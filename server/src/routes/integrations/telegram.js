const express = require('express');
const db = require('../../db');
const config = require('../../config');
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler, AppError } = require('../../middleware/errors');
const { connectLimiter } = require('../../middleware/rateLimit');
const { generateToken, hashToken } = require('../../lib/tokens');

const router = express.Router();

router.use(requireAuth);

function configured() {
  return !!(config.telegram.botToken && config.telegram.botUsername);
}

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    if (!configured()) {
      return res.json({ configured: false, state: 'not_connected', connected: false });
    }
    const conn = await db('telegram_connections').where({ user_id: req.user.id }).first();
    const state = conn ? conn.state : 'not_connected';
    res.json({
      configured: true,
      botUsername: config.telegram.botUsername,
      groupLink: config.telegram.groupLink || null,
      state,
      connected: state === 'active'
    });
  })
);

router.get(
  '/connect',
  connectLimiter,
  asyncHandler(async (req, res) => {
    if (!configured()) {
      throw new AppError('Telegram integration is not configured', 503);
    }

    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let conn = await db('telegram_connections').where({ user_id: req.user.id }).first();
    if (conn) {
      await db('telegram_connections')
        .where({ user_id: req.user.id })
        .update({
          link_token_hash: hashToken(token),
          link_expires_at: expiresAt,
          state: 'invite_generated',
          updated_at: db.fn.now()
        });
    } else {
      await db('telegram_connections').insert({
        user_id: req.user.id,
        link_token_hash: hashToken(token),
        link_expires_at: expiresAt,
        state: 'invite_generated'
      });
    }

    res.json({
      deepLink: `https://t.me/${config.telegram.botUsername}?start=${token}`,
      groupLink: config.telegram.groupLink || null,
      expiresAt: expiresAt.toISOString()
    });
  })
);

// Unlink Telegram without deleting the account (the only previous path was full
// account deletion). Sets state to `left` and clears the Telegram user id.
router.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    await db('telegram_connections')
      .where({ user_id: req.user.id })
      .update({
        state: 'left',
        telegram_user_id: null,
        link_token_hash: null,
        link_expires_at: null,
        updated_at: db.fn.now()
      });
    res.json({ connected: false, state: 'left' });
  })
);

module.exports = router;