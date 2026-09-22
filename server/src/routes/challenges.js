const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { ACTIVITY_TYPES, unitForActivity, UNIT_LABEL, maxGoalForUnit } = require('../constants');
const { todayISO } = require('../lib/dates');
const { createMilestonesForEnrollment, syncMilestones } = require('../services/milestones');
const { ensureActiveChallenge } = require('../services/challenges');
const { getActiveChallenge } = require('../services/challengeWindow');
const { enrollmentSummary } = require('../services/progress');
const { createNotification } = require('../services/notifications');
const telegramMessenger = require('../services/telegramMessenger');
const botMessages = require('../services/botMessages');

const router = express.Router();

// Public: the next/upcoming challenge (used for the landing countdown).
router.get(
  '/next',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    const challenge = await getActiveChallenge();
    if (!challenge) {
      return res.json({ challenge: null });
    }
    const memberCount = await db('enrollments')
      .where({ challenge_id: challenge.id })
      .whereIn('status', ['committed', 'active', 'completed'])
      .countDistinct({ c: 'user_id' })
      .first();
    res.json({
      challenge: {
        id: challenge.id,
        name: challenge.name,
        startDate: challenge.start_date,
        endDate: challenge.end_date,
        started: todayISO() >= challenge.start_date,
        memberCount: Number(memberCount.c) || 0
      }
    });
  })
);

router.use(requireAuth);

const enrollSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  goal_value: z.number().min(1).max(10000)
});

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric'
  });
}

router.get(
  '/current',
  asyncHandler(async (req, res) => {
    // Self-heal: the active challenge is always present (seeded on boot and on
    // demand), so onboarding/enrollment can never hit a missing challenge.
    const challenge = await ensureActiveChallenge();
    const enrollment = await db('enrollments')
      .where({ user_id: req.user.id, challenge_id: challenge.id })
      .first();

    res.json({
      challenge: {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        startDate: challenge.start_date,
        endDate: challenge.end_date,
        startLabel: formatDate(challenge.start_date),
        endLabel: formatDate(challenge.end_date)
      },
      enrollment: enrollment
        ? {
            id: enrollment.id,
            goalValue: Number(enrollment.goal_value),
            goalUnit: unitForActivity(enrollment.activity_type),
            activityType: enrollment.activity_type,
            status: enrollment.status,
            startDate: enrollment.start_date,
            endDate: enrollment.end_date
          }
        : null
    });
  })
);

router.post(
  '/enroll',
  asyncHandler(async (req, res) => {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid enrollment data', 400, parsed.error.flatten());
    }
    const { activity_type, goal_value } = parsed.data;

    const unit = unitForActivity(activity_type);
    const max = maxGoalForUnit(unit);
    if (goal_value > max) {
      throw new AppError(`Goal exceeds the maximum for this activity (${max})`, 400);
    }

    const challenge = await ensureActiveChallenge();
    const existing = await db('enrollments')
      .where({ user_id: req.user.id, challenge_id: challenge.id })
      .first();
    if (existing) {
      // Idempotent: enrolling when already enrolled is not an error. Return the
      // existing enrollment so retries/double-submits never surface a 409.
      const summary = await enrollmentSummary(existing.id);
      return res.status(200).json({
        message: 'Already enrolled',
        alreadyEnrolled: true,
        enrollment: summary.enrollment
      });
    }

    let enrollmentId;
    await db.transaction(async (trx) => {
      const [id] = await trx('enrollments').insert({
        user_id: req.user.id,
        challenge_id: challenge.id,
        activity_type,
        goal_value,
        start_date: challenge.start_date,
        end_date: challenge.end_date,
        status: 'committed'
      });
      enrollmentId = id;
      await createMilestonesForEnrollment(id, activity_type, trx);
    });

    const summary = await enrollmentSummary(enrollmentId);

    await createNotification({
      userId: req.user.id,
      type: 'commitment',
      title: 'Your 100 starts now.',
      body: `Goal: ${goal_value} ${UNIT_LABEL[unit]}. ${challenge.start_date} → ${challenge.end_date}.`
    });

    const lang = await telegramMessenger.getUserLanguage(req.user.id);
    telegramMessenger.sendToUser(req.user.id, botMessages.commitment(lang, goal_value, UNIT_LABEL[unit]));
    telegramMessenger.broadcastJoin(req.user.name);

    res.status(201).json({ message: 'Enrolled', enrollment: summary.enrollment });
  })
);

module.exports = router;