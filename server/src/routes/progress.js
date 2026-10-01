const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { enrollmentSummary } = require('../services/progress');
const { getActiveChallenge } = require('../services/challengeWindow');
const { currentStreakForEnrollment } = require('../services/streaks');
const { todayISO, addDaysISO } = require('../lib/dates');

const router = express.Router();

router.use(requireAuth);

// Last 7 days of activity (date → quantity) for the dashboard sparkline.
async function weekSeriesForEnrollment(enrollmentId) {
  const today = todayISO();
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDaysISO(today, -i));
  const rows = await db('challenge_activities')
    .where({ enrollment_id: enrollmentId })
    .whereIn('date', days)
    .select('date')
    .sum({ value: 'quantity' })
    .groupBy('date');
  const byDate = {};
  for (const r of rows) byDate[r.date] = Number(r.value) || 0;
  return days.map((d) => ({ date: d, value: byDate[d] || 0 }));
}

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

    const [summary, streak, weekSeries] = await Promise.all([
      enrollmentSummary(enrollment.id),
      currentStreakForEnrollment(enrollment.id),
      weekSeriesForEnrollment(enrollment.id)
    ]);
    res.json({ ...summary, streak, weekSeries });
  })
);

module.exports = router;