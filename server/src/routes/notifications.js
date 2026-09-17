const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { listForUser, markAllRead } = require('../services/notifications');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await listForUser(req.user.id);
    res.json({ notifications });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user.id);
    res.json({ message: 'All read' });
  })
);

module.exports = router;