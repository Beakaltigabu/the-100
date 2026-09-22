const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { todayISO, startOfWeek } = require('../lib/dates');
const { unitForActivity, UNIT_LABEL, ACTIVITY_TYPES } = require('../constants');
const { postLimiter, cheerLimiter, reportLimiter } = require('../middleware/rateLimit');
const { buildFeed } = require('../services/communityFeed');
const { getActiveChallenge } = require('../services/challengeWindow');
const { enrollmentSummary } = require('../services/progress');

const router = express.Router();

router.use(requireAuth);

const checkInSchema = z.object({
  body: z.string().trim().max(500).optional(),
  distance: z.number().positive().max(10000).nullable().optional(),
  activity_type: z.enum(ACTIVITY_TYPES).nullable().optional(),
  enrollment_id: z.number().int().positive().nullable().optional()
});

function unitLabel(activityType) {
  return UNIT_LABEL[unitForActivity(activityType)] || 'KM';
}

// ── Community pulse ─────────────────────────────────
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const challenge = await getActiveChallenge();
    const members = await db('enrollments')
      .whereIn('status', ['committed', 'active'])
      .countDistinct({ c: 'user_id' })
      .first();

    let distanceMoved = 0;
    if (challenge) {
      const ids = await db('enrollments')
        .where({ challenge_id: challenge.id })
        .whereIn('status', ['committed', 'active'])
        .pluck('id');
      if (ids.length) {
        const r = await db('challenge_activities').whereIn('enrollment_id', ids).sum({ s: 'quantity' }).first();
        distanceMoved = Number(r.s) || 0;
      }
    }

    const weekStart = startOfWeek(todayISO());
    const activeWeek = await db('challenge_activities')
      .where('date', '>=', weekStart)
      .countDistinct({ c: 'enrollment_id' })
      .first();

    // Community-wide aggregates tolerate a short cache (per-user, since the
    // endpoint sits behind auth).
    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      stats: {
        members: Number(members.c),
        distanceMoved: Math.round(distanceMoved * 100) / 100,
        activeWeek: Number(activeWeek.c)
      }
    });
  })
);

// ── Feed (normalized, tiered, cursor-paginated) ─────
router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || undefined;
    const { items, nextCursor } = await buildFeed({
      limit,
      cursor: req.query.cursor || undefined,
      type: req.query.type || undefined,
      challengeId: req.query.challengeId ? Number(req.query.challengeId) : undefined,
      viewerId: req.user.id
    });
    res.json({ items, nextCursor });
  })
);

// ── People moving now ───────────────────────────────
router.get(
  '/people',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    const challenge = await getActiveChallenge();
    if (!challenge) return res.json({ people: [] });

    // One query: per-enrollment totals + last activity via a grouped subquery,
    // ordered and limited in SQL (never loads the full member list into JS).
    const rows = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .leftJoin(
        db('challenge_activities')
          .select('enrollment_id')
          .sum({ total: 'quantity' })
          .max({ last_date: 'date' })
          .groupBy('enrollment_id')
          .as('agg'),
        'agg.enrollment_id',
        'enrollments.id'
      )
      .where('enrollments.challenge_id', challenge.id)
      .whereIn('enrollments.status', ['committed', 'active'])
      .select(
        'users.id as user_id',
        'users.name',
        'users.photo_url',
        'enrollments.activity_type',
        'enrollments.goal_value',
        'agg.total',
        'agg.last_date'
      )
      // Most recently active first; members with no activity yet go last.
      .orderByRaw('agg.last_date IS NULL, agg.last_date DESC')
      .limit(limit);

    const people = rows.map((r) => {
      const goal = Number(r.goal_value);
      const total = Number(r.total) || 0;
      return {
        id: r.user_id,
        name: r.name,
        avatarUrl: r.photo_url || null,
        activityType: r.activity_type,
        goalValue: goal,
        unit: unitLabel(r.activity_type),
        percent: goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0,
        lastActivity: r.last_date || null
      };
    });

    res.json({ people });
  })
);

// ── Member profile ──────────────────────────────────
router.get(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) throw new AppError('Member not found', 404);

    const challenge = await getActiveChallenge();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: user.id, challenge_id: challenge.id }).first()
      : null;
    const summary = enrollment ? await enrollmentSummary(enrollment.id) : null;

    const completed = await db('enrollments')
      .where({ user_id: user.id, status: 'completed' })
      .select('activity_type', 'goal_value', 'completed_at as ts');

    const checkIns = await db('community_posts')
      .where({ user_id: user.id, type: 'check_in', status: 'published' })
      .orderBy('created_at', 'desc')
      .limit(20)
      .select('id', 'body', 'distance', 'activity_type', 'created_at as ts');

    res.json({
      member: {
        id: user.id,
        name: user.name,
        avatarUrl: user.photo_url || null,
        socialHandle: user.social_handle || null,
        activityType: user.activity_type || (summary && summary.enrollment.activityType) || null
      },
      challenge: summary ? summary.enrollment : null,
      progress: summary
        ? { totalValue: summary.totalValue, percent: summary.percent, status: summary.status, day: summary.enrollment.day }
        : null,
      completed: completed.map((c) => ({ goal: Number(c.goal_value), unit: unitLabel(c.activity_type), ts: c.ts })),
      checkIns: checkIns.map((c) => ({
        id: c.id,
        body: c.body,
        distance: c.distance != null ? Number(c.distance) : null,
        activityType: c.activity_type,
        ts: c.ts
      }))
    });
  })
);

// ── Check-in creation ───────────────────────────────
router.post(
  '/posts',
  postLimiter,
  asyncHandler(async (req, res) => {
    const parsed = checkInSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid check-in', 400, parsed.error.flatten());
    const { body, distance, activity_type, enrollment_id } = parsed.data;
    if (!body && distance == null) throw new AppError('Add a message or a distance', 400);

    let enrollment = null;
    if (enrollment_id) {
      enrollment = await db('enrollments').where({ id: enrollment_id, user_id: req.user.id }).first();
      if (!enrollment) throw new AppError('Enrollment not found', 404);
    } else {
      const challenge = await getActiveChallenge();
      if (challenge) {
        enrollment = await db('enrollments').where({ user_id: req.user.id, challenge_id: challenge.id }).first();
      }
    }

    const activityType = activity_type || (enrollment && enrollment.activity_type) || null;
    const [id] = await db('community_posts').insert({
      user_id: req.user.id,
      body: body || null,
      distance: distance != null ? distance : null,
      activity_type: activityType,
      challenge_id: enrollment ? enrollment.challenge_id : null,
      enrollment_id: enrollment ? enrollment.id : null,
      type: 'check_in',
      status: 'published'
    });
    res.status(201).json({ message: 'Shared', postId: id });
  })
);

// ── Cheer toggle (works for any normalized item key) ─
const ITEM_KEY_RE = /^(milestone|finish|join|check_in):\d+$/;

router.post(
  '/items/:key/cheer',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!ITEM_KEY_RE.test(key)) throw new AppError('Invalid item', 400);
    const existing = await db('community_cheers').where({ item_key: key, user_id: req.user.id }).first();
    if (existing) {
      await db('community_cheers').where({ id: existing.id }).del();
    } else {
      await db('community_cheers').insert({ item_key: key, user_id: req.user.id });
    }
    const count = await db('community_cheers').where({ item_key: key }).count({ c: '*' }).first();
    res.json({ cheers: Number(count.c), cheered: !existing });
  })
);

// ── Report content ──────────────────────────────────
router.post(
  '/posts/:id/report',
  reportLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ reason: z.string().trim().min(1).max(300).optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid report', 400);
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) throw new AppError('Post not found', 404);
    const existing = await db('community_reports').where({ post_id: post.id, reporter_id: req.user.id }).first();
    if (!existing) {
      await db('community_reports').insert({
        post_id: post.id,
        reporter_id: req.user.id,
        reason: parsed.data.reason || null
      });
    }
    res.json({ message: 'Reported. Thanks.' });
  })
);

// ── Delete own check-in (owner or admin) ────────────
router.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) throw new AppError('Post not found', 404);
    if (post.user_id !== req.user.id && !req.isAdmin) throw new AppError('Not allowed to delete this post', 403);
    await db('community_posts').where({ id: post.id }).del();
    res.json({ message: 'Deleted' });
  })
);

module.exports = router;