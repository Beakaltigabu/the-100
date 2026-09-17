const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { ACTIVITY_TYPES, EXPERIENCE_LEVELS, GOAL_BANDS, recommendGoals, unitForActivity } = require('../constants');

const router = express.Router();

const MOTIVATIONS = [
  'health',
  'energy',
  'stress',
  'challenge',
  'community',
  'fitness',
  'weight',
  'sleep',
  'mind',
  'discipline'
];

const EXPERIENCE_MULTIPLIER = {
  beginner: 0.7,
  occasional: 0.85,
  consistent: 1.0,
  experienced: 1.2
};

const WEEKS_IN_100_DAYS = 100 / 7; // ≈ 14.3

const onboardingSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  experience_level: z.enum(EXPERIENCE_LEVELS),
  weekly_baseline: z.number().min(0).max(500),
  other_activity: z.string().max(60).optional().nullable(),
  motivation: z.array(z.enum(MOTIVATIONS)).min(1).max(3).optional(),
  preferred_time: z.enum(['morning', 'evening', 'flexible']).optional().nullable(),
  schedule_days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .optional()
    .nullable()
});

router.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid onboarding data', 400, parsed.error.flatten());
    }
    const {
      activity_type,
      experience_level,
      weekly_baseline,
      other_activity,
      motivation,
      preferred_time,
      schedule_days
    } = parsed.data;

    await db('users')
      .where({ id: req.user.id })
      .update({
        activity_type,
        experience_level,
        weekly_baseline,
        other_activity: other_activity || null,
        motivation: motivation && motivation.length ? motivation.join(',') : null,
        preferred_time: preferred_time || null,
        schedule_days: schedule_days && schedule_days.length ? schedule_days.join(',') : null,
        onboarding_complete: true,
        updated_at: db.fn.now()
      });

    res.json({ message: 'Onboarding saved' });
  })
);

router.get(
  '/recommendations',
  asyncHandler(async (req, res) => {
    const activityType = req.query.activity_type || (req.user && req.user.activity_type) || 'running';
    const experienceLevel = req.query.experience_level || (req.user && req.user.experience_level) || 'consistent';
    const baseline = Number(req.query.baseline) || Number(req.user && req.user.weekly_baseline) || 0;

    const bands = recommendGoals(activityType, baseline);
    const levels = ['comfortable', 'challenging', 'serious', 'extreme'];

    const multiplier = EXPERIENCE_MULTIPLIER[experienceLevel] || 1.0;
    const recommendedValue =
      baseline > 0 ? Math.round((baseline * WEEKS_IN_100_DAYS * multiplier) / 5) * 5 : bands[1];

    let recommendedIndex = 0;
    let bestDiff = Infinity;
    bands.forEach((value, i) => {
      const diff = Math.abs(value - recommendedValue);
      if (diff < bestDiff) {
        bestDiff = diff;
        recommendedIndex = i;
      }
    });

    const goals = bands.map((value, i) => {
      const weeklyPace = Math.round((value / WEEKS_IN_100_DAYS) * 10) / 10;
      return {
        value,
        level: levels[i],
        weeklyPace,
        vsBaseline: baseline > 0 ? Math.round((weeklyPace / baseline) * 10) / 10 : null,
        recommended: i === recommendedIndex
      };
    });

    res.json({
      weeklyBaseline: baseline,
      experienceLevel,
      activityType,
      unit: unitForActivity(activityType),
      goals,
      all: GOAL_BANDS
    });
  })
);

module.exports = router;