const express = require('express');
const z = require('zod');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, clearAuthCookie } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { deleteLimiter } = require('../middleware/rateLimit');
const { unitForActivity } = require('../constants');
const { todayISO, diffDays } = require('../lib/dates');
const config = require('../config');
const { sanitizeName } = require('../lib/sanitize');

const router = express.Router();

router.use(requireAuth);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  location: z.string().max(120).nullable().optional(),
  age: z.number().int().min(13).max(120).nullable().optional(),
  social_handle: z.string().max(120).nullable().optional(),
  language: z.enum(['en', 'am']).optional()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    const challenge = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: user.id, challenge_id: challenge.id }).first()
      : null;

    const total = enrollment
      ? Number(
          (
            await db('challenge_activities').where({ enrollment_id: enrollment.id }).sum({ s: 'quantity' }).first()
          ).s || 0
        )
      : 0;

    const telegram = await db('telegram_connections').where({ user_id: user.id }).first();
    const strava = await db('strava_connections').where({ user_id: user.id }).first();

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photoUrl: user.photo_url,
        hasPassword: !!user.password_hash,
        location: user.location,
        age: user.age,
        socialHandle: user.social_handle,
        experienceLevel: user.experience_level,
        weeklyBaseline: Number(user.weekly_baseline) || null,
        activityType: user.activity_type,
        otherActivity: user.other_activity || null,
        motivation: user.motivation ? user.motivation.split(',').filter(Boolean) : [],
        preferredTime: user.preferred_time || null,
        scheduleDays: user.schedule_days ? user.schedule_days.split(',').map(Number) : []
      },
      challenge: enrollment
        ? {
            goalValue: Number(enrollment.goal_value),
            goalUnit: unitForActivity(enrollment.activity_type),
            activityType: enrollment.activity_type,
            status: enrollment.status,
            startDate: enrollment.start_date,
            endDate: enrollment.end_date,
            totalValue: total,
            daysUntilStart: Math.max(0, diffDays(todayISO(), (challenge && challenge.start_date) || enrollment.start_date)),
            percent: Number(enrollment.goal_value) > 0 ? Math.round((total / Number(enrollment.goal_value)) * 1000) / 10 : 0
          }
        : null,
      integrations: {
        telegram: telegram
          ? { connected: telegram.state === 'active', state: telegram.state, groupLink: config.telegram.groupLink || null }
          : { connected: false, state: 'not_connected', groupLink: config.telegram.groupLink || null },
        strava: strava
          ? { connected: strava.status === 'connected', athleteId: strava.strava_athlete_id }
          : { connected: false }
      }
    });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Invalid profile data', 400, parsed.error.flatten());
    }
    const updates = {};
    if (parsed.data.name !== undefined) updates.name = sanitizeName(parsed.data.name);
    if (parsed.data.location !== undefined) updates.location = parsed.data.location || null;
    if (parsed.data.age !== undefined) updates.age = parsed.data.age;
    if (parsed.data.social_handle !== undefined) updates.social_handle = parsed.data.social_handle || null;
    if (parsed.data.language !== undefined) updates.language = parsed.data.language;
    updates.updated_at = db.fn.now();

    await db('users').where({ id: req.user.id }).update(updates);
    res.json({ message: 'Profile updated' });
  })
);

// ── Account deletion (GDPR) ─────────────────────────
router.delete(
  '/',
  deleteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ password: z.string().max(128).optional(), confirm: z.literal(true) }).safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Please confirm that you want to delete your account', 400);
    }
    const { password } = parsed.data;
    const user = req.user;
    if (user.password_hash) {
      if (!password) {
        throw new AppError('Enter your password to delete your account', 400);
      }
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        throw new AppError('Incorrect password', 401);
      }
    }

    // Explicit ordered deletes (the schema has FK cascades too; this is belt & suspenders).
    await db.transaction(async (trx) => {
      const enrollmentIds = await trx('enrollments').where({ user_id: user.id }).pluck('id');
      if (enrollmentIds.length) {
        await trx('challenge_activities').whereIn('enrollment_id', enrollmentIds).del();
        await trx('milestones').whereIn('enrollment_id', enrollmentIds).del();
      }
      await trx('enrollments').where({ user_id: user.id }).del();
      await trx('telegram_connections').where({ user_id: user.id }).del();
      await trx('strava_connections').where({ user_id: user.id }).del();
      await trx('notifications').where({ user_id: user.id }).del();
      await trx('community_posts').where({ user_id: user.id }).del();
      await trx('post_cheers').where({ user_id: user.id }).del();
      await trx('password_reset_tokens').where({ user_id: user.id }).del();
      await trx('admins').where({ user_id: user.id }).del();
      await trx('users').where({ id: user.id }).del();
    });

    clearAuthCookie(res);
    res.json({ message: 'Account deleted.' });
  })
);

module.exports = router;