const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const challenge = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: req.user.id, challenge_id: challenge.id }).first()
      : null;

    if (!enrollment) {
      return res.json({ milestones: [] });
    }

    const milestones = await db('milestones').where({ enrollment_id: enrollment.id }).orderBy('threshold', 'asc');
    res.json({
      milestones: milestones.map((m) => ({
        threshold: Number(m.threshold),
        reached: !!m.reached_at
      }))
    });
  })
);

module.exports = router;