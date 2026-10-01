const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { listForUser, unreadCountForUser, markRead, markAllRead, getPreferences, setPreferences } = require('../services/notifications');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [notifications, unread] = await Promise.all([
      listForUser(req.user.id),
      unreadCountForUser(req.user.id)
    ]);
    res.json({ notifications, unread });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ unread: await unreadCountForUser(req.user.id) });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await markAllRead(req.user.id);
    res.json({ message: 'All read' });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const ok = await markRead(req.user.id, parseInt(req.params.id, 10));
    res.json({ ok });
  })
);

router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    res.json({ preferences: await getPreferences(req.user.id) });
  })
);

router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    await setPreferences(req.user.id, (req.body && req.body.preferences) || []);
    res.json({ message: 'Preferences saved' });
  })
);

module.exports = router;