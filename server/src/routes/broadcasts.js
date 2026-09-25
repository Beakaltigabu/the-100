const express = require('express');
const db = require('../db');
const config = require('../config');
const { verifyToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { getActiveBroadcastFor } = require('../services/broadcast');

const router = express.Router();

// Optional auth: attach req.user when a valid session cookie is present, else
// treat the caller as a guest (landing visitor).
async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[config.cookie.name];
    if (token) {
      const payload = verifyToken(token);
      const user = await db('users').where({ id: payload.sub }).first();
      if (user && (payload.tv ?? 0) === (user.token_version ?? 0)) {
        req.user = user;
        const admin = await db('admins').where({ user_id: user.id }).first();
        req.isAdmin = !!admin;
      }
    }
  } catch {
    // invalid/expired token → guest
  }
  next();
}

router.get(
  '/active',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const placement = userId ? 'app' : 'landing';
    const broadcast = await getActiveBroadcastFor({ userId, placement, isAdmin: !!req.isAdmin });
    res.json({ broadcast });
  })
);

module.exports = router;
