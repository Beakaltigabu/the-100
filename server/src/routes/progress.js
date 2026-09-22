const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { enrollmentSummary } = require('../services/progress');
const { getActiveChallenge } = require('../services/challengeWindow');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const challenge = await getActiveChallenge();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: req.user.id, challenge_id: challenge.id }).first()
      : null;

    if (!enrollment) {
      return res.json({ enrollment: null });
    }

    const summary = await enrollmentSummary(enrollment.id);
    res.json(summary);
  })
);

module.exports = router;