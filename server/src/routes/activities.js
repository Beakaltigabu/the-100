const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { ACTIVITY_TYPES } = require('../constants');
const { logActivity, getEnrollmentForUser } = require('../services/logActivity');

const router = express.Router();

router.use(requireAuth);

const logSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive().max(500),
  activity_type: z.enum(ACTIVITY_TYPES),
  notes: z.string().max(255).optional()
});

router.post(
  '/manual',
  asyncHandler(async (req, res) => {
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid activity data', 400, parsed.error.flatten());
    }
    const { date, quantity, activity_type, notes } = parsed.data;

    const result = await logActivity({
      user: req.user,
      date,
      quantity,
      activityType: activity_type,
      notes
    });

    if (!result.ok) {
      if (result.reason === 'no-enrollment') {
        throw new AppError('You must commit to a challenge before logging', 409);
      }
      if (result.reason === 'not-started') {
        throw new AppError(`The 100 begins on ${result.start}. Logging opens then.`, 403);
      }
      throw new AppError(`Log activities dated between ${result.start} and ${result.end}.`, 400);
    }

    res.status(201).json({
      activity: { id: result.id, date, quantity, activity_type, source: 'manual' },
      overlapping: result.overlapping,
      milestonesReached: result.milestonesReached
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const enrollment = await getEnrollmentForUser(req.user.id);
    if (!enrollment) {
      return res.json({ activities: [] });
    }
    const activities = await db('challenge_activities')
      .where({ enrollment_id: enrollment.id })
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
      .limit(100);
    res.json({ activities });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const activity = await db('challenge_activities').where({ id: req.params.id }).first();
    if (!activity) {
      throw new AppError('Activity not found', 404);
    }
    if (activity.source !== 'manual') {
      throw new AppError('Only manual activities can be deleted', 400);
    }
    await db('challenge_activities').where({ id: activity.id }).del();
    res.json({ message: 'Deleted' });
  })
);

module.exports = router;