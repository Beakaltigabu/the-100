const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { todayISO, startOfWeek } = require('../lib/dates');
const { unitForActivity, UNIT_LABEL, ACTIVITY_TYPES } = require('../constants');
const { postLimiter, cheerLimiter, reportLimiter, commentLimiter } = require('../middleware/rateLimit');
const { buildFeed } = require('../services/communityFeed');
const { getActiveChallenge } = require('../services/challengeWindow');
const { enrollmentSummary } = require('../services/progress');
const { listBadgesForUser } = require('../services/badges');
const telegramMessenger = require('../services/telegramMessenger');

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
    let distanceGoal = 0;
    if (challenge) {
      const ids = await db('enrollments')
        .where({ challenge_id: challenge.id })
        .whereIn('status', ['committed', 'active'])
        .pluck('id');
      if (ids.length) {
        const r = await db('challenge_activities').whereIn('enrollment_id', ids).sum({ s: 'quantity' }).first();
        distanceMoved = Number(r.s) || 0;
        const g = await db('enrollments').whereIn('id', ids).sum({ s: 'goal_value' }).first();
        distanceGoal = Number(g.s) || 0;
      }
    }
    const distancePct = distanceGoal > 0 ? Math.min(100, Math.round((distanceMoved / distanceGoal) * 100)) : 0;

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
        distanceGoal: distanceGoal,
        distancePct,
        activeWeek: Number(activeWeek.c)
      }
    });
  })
);

// ── Weekly movers board ─────────────────────────────
router.get(
  '/movers',
  asyncHandler(async (req, res) => {
    const weekStart = startOfWeek(todayISO());
    const challenge = await getActiveChallenge();
    if (!challenge) return res.json({ movers: [] });

    const rows = await db('challenge_activities')
      .join('enrollments', 'enrollments.id', 'challenge_activities.enrollment_id')
      .join('users', 'users.id', 'enrollments.user_id')
      .where('enrollments.challenge_id', challenge.id)
      .whereIn('enrollments.status', ['committed', 'active'])
      .where('challenge_activities.date', '>=', weekStart)
      .groupBy('users.id', 'users.name', 'users.photo_url', 'enrollments.activity_type')
      .select('users.id as user_id', 'users.name', 'users.photo_url', 'enrollments.activity_type')
      .sum({ total: 'challenge_activities.quantity' })
      .orderBy('total', 'desc')
      .limit(10);

    const movers = rows.map((r) => ({
      id: r.user_id,
      name: r.name,
      avatarUrl: r.photo_url || null,
      activityType: r.activity_type,
      total: Math.round(Number(r.total) * 100) / 100,
      unit: unitLabel(r.activity_type)
    }));
    res.json({ movers });
  })
);

// ── Member spotlight (rotating "member of the day") ──
router.get(
  '/spotlight',
  asyncHandler(async (req, res) => {
    const challenge = await getActiveChallenge();
    if (!challenge) return res.json({ spotlight: null });
    const row = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .where('enrollments.challenge_id', challenge.id)
      .whereIn('enrollments.status', ['committed', 'active'])
      .select(
        'users.id as user_id',
        'users.name',
        'users.photo_url',
        'enrollments.activity_type',
        'enrollments.goal_value'
      )
      .orderByRaw('RAND()')
      .limit(1)
      .first();
    if (!row) return res.json({ spotlight: null });
    res.json({
      spotlight: {
        id: row.user_id,
        name: row.name,
        avatarUrl: row.photo_url || null,
        activityType: row.activity_type,
        goalValue: Number(row.goal_value),
        unit: unitLabel(row.activity_type)
      }
    });
  })
);

// ── Daily prompt (deterministic per day; localized on the client) ──
router.get(
  '/prompt',
  asyncHandler(async (req, res) => {
    const dayIndex = Math.floor(Date.now() / 86400000);
    res.json({ index: dayIndex });
  })
);

// ── Community challenges ─────────────────────────────
async function challengeProgress(challenge, participantIds) {
  if (!participantIds.length) return { value: 0, pct: 0 };
  const enrollments = await db('enrollments')
    .whereIn('user_id', participantIds)
    .whereIn('status', ['committed', 'active'])
    .select('id');
  const enrollmentIds = enrollments.map((e) => e.id);
  if (!enrollmentIds.length) return { value: 0, pct: 0 };
  const end = challenge.end_date < todayISO() ? challenge.end_date : todayISO();
  const row = await db('challenge_activities')
    .whereIn('enrollment_id', enrollmentIds)
    .where('date', '>=', challenge.start_date)
    .where('date', '<=', end)
    .sum({ s: 'quantity' })
    .first();
  const value = Math.round((Number(row.s) || 0) * 100) / 100;
  return { value, pct: Number(challenge.goal_value) > 0 ? Math.min(100, Math.round((value / Number(challenge.goal_value)) * 100)) : 0 };
}

router.get(
  '/challenges',
  asyncHandler(async (req, res) => {
    const rows = await db('community_challenges')
      .where({ status: 'active' })
      .orderBy('end_date', 'asc')
      .limit(10);
    const out = [];
    for (const c of rows) {
      const participants = await db('community_challenge_participants').where({ challenge_id: c.id }).select('user_id');
      const ids = participants.map((p) => p.user_id);
      const progress = await challengeProgress(c, ids);
      out.push({
        id: c.id,
        title: c.title,
        description: c.description,
        goalValue: Number(c.goal_value),
        goalUnit: c.goal_unit,
        startDate: c.start_date,
        endDate: c.end_date,
        participants: ids.length,
        joined: ids.includes(req.user.id),
        ...progress
      });
    }
    res.json({ challenges: out });
  })
);

router.post(
  '/challenges/:id/join',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const challenge = await db('community_challenges').where({ id }).first();
    if (!challenge) throw new AppError('Challenge not found', 404);
    const existing = await db('community_challenge_participants').where({ challenge_id: id, user_id: req.user.id }).first();
    if (existing) {
      await db('community_challenge_participants').where({ id: existing.id }).del();
      return res.json({ joined: false });
    }
    await db('community_challenge_participants').insert({ challenge_id: id, user_id: req.user.id });
    res.json({ joined: true });
  })
);

// Admin: create a community challenge.
router.post(
  '/challenges',
  asyncHandler(async (req, res) => {
    if (!req.isAdmin) throw new AppError('Admins only', 403);
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(300).optional(),
        goal_value: z.number().positive(),
        goal_unit: z.string().trim().max(10).optional(),
        start_date: z.string().trim().min(10).max(10),
        end_date: z.string().trim().min(10).max(10)
      })
      .safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid challenge', 400);
    const [id] = await db('community_challenges').insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      goal_value: parsed.data.goal_value,
      goal_unit: parsed.data.goal_unit || 'km',
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      status: 'active',
      created_by: req.user.id
    });
    res.status(201).json({ message: 'Challenge created', id });
  })
);

// ── Leaderboard ──────────────────────────────────────
router.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const period = req.query.period === 'all' ? 'all' : 'week';
    const weekStart = startOfWeek(todayISO());
    const challenge = await getActiveChallenge();
    if (!challenge) return res.json({ entries: [], viewer: null });

    const rows = await db('challenge_activities')
      .join('enrollments', 'enrollments.id', 'challenge_activities.enrollment_id')
      .join('users', 'users.id', 'enrollments.user_id')
      .where('enrollments.challenge_id', challenge.id)
      .whereIn('enrollments.status', ['committed', 'active'])
      .modify((q) => {
        if (period === 'week') q.where('challenge_activities.date', '>=', weekStart);
      })
      .groupBy('users.id', 'users.name', 'users.photo_url', 'enrollments.activity_type')
      .select('users.id as user_id', 'users.name', 'users.photo_url', 'enrollments.activity_type')
      .sum({ total: 'challenge_activities.quantity' })
      .orderBy('total', 'desc')
      .limit(10);

    const entries = rows.map((r) => ({
      id: r.user_id,
      name: r.name,
      avatarUrl: r.photo_url || null,
      total: Math.round(Number(r.total) * 100) / 100,
      unit: unitLabel(r.activity_type),
      isMe: r.user_id === req.user.id
    }));
    const allRows = await db('challenge_activities')
      .join('enrollments', 'enrollments.id', 'challenge_activities.enrollment_id')
      .where('enrollments.challenge_id', challenge.id)
      .whereIn('enrollments.status', ['committed', 'active'])
      .modify((q) => {
        if (period === 'week') q.where('challenge_activities.date', '>=', weekStart);
      })
      .groupBy('enrollments.user_id')
      .select('enrollments.user_id')
      .sum({ total: 'challenge_activities.quantity' })
      .orderBy('total', 'desc');
    const rank = allRows.findIndex((r) => r.user_id === req.user.id) + 1;
    res.json({ entries, viewer: { rank: rank || null, total: allRows.length } });
  })
);

// ── Feed (normalized, tiered, cursor-paginated) ─────
router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || undefined;
    let followingIds = null;
    if (req.query.following === '1') {
      const rows = await db('community_follows').where({ follower_id: req.user.id }).select('following_id');
      followingIds = rows.map((r) => r.following_id);
    }
    const { items, nextCursor } = await buildFeed({
      limit,
      cursor: req.query.cursor || undefined,
      type: req.query.type || undefined,
      challengeId: req.query.challengeId ? Number(req.query.challengeId) : undefined,
      viewerId: req.user.id,
      followingIds
    });
    res.json({ items, nextCursor });
  })
);

// ── Recent activity ticker (social proof) ────────────
router.get(
  '/recent-activity',
  asyncHandler(async (req, res) => {
    const rows = await db('community_posts')
      .join('users', 'users.id', 'community_posts.user_id')
      .where({ 'community_posts.type': 'check_in', 'community_posts.status': 'published' })
      .select(
        'community_posts.id',
        'community_posts.body',
        'community_posts.distance',
        'community_posts.activity_type',
        'community_posts.created_at as ts',
        'users.id as user_id',
        'users.name'
      )
      .orderBy('community_posts.created_at', 'desc')
      .limit(5);
    res.json({
      activity: rows.map((r) => ({
        id: r.id,
        name: r.name,
        distance: r.distance != null ? Number(r.distance) : null,
        activityType: r.activity_type,
        ts: r.ts
      }))
    });
  })
);

// ── People moving now ───────────────────────────────
router.get(
  '/people',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 200);
    const activeWeek = req.query.activeWeek === '1';
    const weekStart = startOfWeek(todayISO());
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
      .modify((q) => {
        if (activeWeek) q.where('agg.last_date', '>=', weekStart);
      })
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

    const badges = await listBadgesForUser(user.id);

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
      badges,
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

// ── Cheer / reaction toggle (works for any normalized item key) ─
const ITEM_KEY_RE = /^(milestone|finish|join|check_in|announcement):\d+$/;
const REACTIONS = ['🔥', '👏', '💪', '🏁'];

router.post(
  '/items/:key/cheer',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!ITEM_KEY_RE.test(key)) throw new AppError('Invalid item', 400);
    const reaction = REACTIONS.includes(req.body && req.body.reaction) ? req.body.reaction : '🔥';
    const existing = await db('community_cheers').where({ item_key: key, user_id: req.user.id, reaction }).first();
    if (existing) {
      await db('community_cheers').where({ id: existing.id }).del();
    } else {
      await db('community_cheers').insert({ item_key: key, user_id: req.user.id, reaction });
    }
    const counts = await db('community_cheers').where({ item_key: key }).groupBy('reaction').select('reaction').count({ c: '*' });
    const mine = await db('community_cheers').where({ item_key: key, user_id: req.user.id }).select('reaction');
    const reactions = {};
    let total = 0;
    for (const r of REACTIONS) reactions[r] = 0;
    for (const r of counts) {
      reactions[r.reaction] = Number(r.c);
      total += Number(r.c);
    }
    res.json({ reactions, total, myReactions: mine.map((r) => r.reaction) });
  })
);

// ── Comments ────────────────────────────────────────
router.get(
  '/items/:key/comments',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!ITEM_KEY_RE.test(key)) throw new AppError('Invalid item', 400);
    const comments = await db('community_comments')
      .join('users', 'users.id', 'community_comments.user_id')
      .where({ 'community_comments.item_key': key })
      .select(
        'community_comments.id',
        'community_comments.body',
        'community_comments.created_at as ts',
        'users.id as user_id',
        'users.name',
        'users.photo_url'
      )
      .orderBy('community_comments.created_at', 'asc')
      .limit(50);
    res.json({ comments });
  })
);

router.post(
  '/items/:key/comments',
  commentLimiter,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!ITEM_KEY_RE.test(key)) throw new AppError('Invalid item', 400);
    const parsed = z.object({ body: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) throw new AppError('Comment required', 400);
    const [id] = await db('community_comments').insert({
      item_key: key,
      user_id: req.user.id,
      body: parsed.data.body
    });
    res.status(201).json({ message: 'Commented', commentId: id });
  })
);

router.delete(
  '/items/:key/comments/:id',
  asyncHandler(async (req, res) => {
    const comment = await db('community_comments').where({ id: req.params.id }).first();
    if (!comment) throw new AppError('Comment not found', 404);
    if (comment.user_id !== req.user.id && !req.isAdmin) throw new AppError('Not allowed to delete this comment', 403);
    await db('community_comments').where({ id: comment.id }).del();
    res.json({ message: 'Deleted' });
  })
);

// ── Follow ───────────────────────────────────────────
router.post(
  '/follow/:id',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    if (!targetId || targetId === req.user.id) throw new AppError('Invalid user', 400);
    const existing = await db('community_follows').where({ follower_id: req.user.id, following_id: targetId }).first();
    if (existing) {
      await db('community_follows').where({ id: existing.id }).del();
      return res.json({ following: false });
    }
    await db('community_follows').insert({ follower_id: req.user.id, following_id: targetId });
    res.json({ following: true });
  })
);

router.get(
  '/following',
  asyncHandler(async (req, res) => {
    const rows = await db('community_follows').where({ follower_id: req.user.id }).select('following_id');
    res.json({ ids: rows.map((r) => r.following_id) });
  })
);

// ── Bookmarks (save) ─────────────────────────────────
router.post(
  '/items/:key/bookmark',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!ITEM_KEY_RE.test(key)) throw new AppError('Invalid item', 400);
    const existing = await db('community_bookmarks').where({ item_key: key, user_id: req.user.id }).first();
    if (existing) {
      await db('community_bookmarks').where({ id: existing.id }).del();
      return res.json({ saved: false });
    }
    await db('community_bookmarks').insert({ item_key: key, user_id: req.user.id });
    res.json({ saved: true });
  })
);

router.get(
  '/bookmarks',
  asyncHandler(async (req, res) => {
    const rows = await db('community_bookmarks')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc')
      .limit(200);
    res.json({ keys: rows.map((r) => r.item_key) });
  })
);

// ── Search members + posts ───────────────────────────
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.json({ members: [], posts: [] });
    const [members, posts] = await Promise.all([
      db('users').where('name', 'like', `%${q}%`).select('id', 'name', 'photo_url').limit(10),
      db('community_posts')
        .join('users', 'users.id', 'community_posts.user_id')
        .where('community_posts.status', 'published')
        .where('community_posts.body', 'like', `%${q}%`)
        .select(
          'community_posts.id',
          'community_posts.body',
          'community_posts.created_at as ts',
          'users.id as user_id',
          'users.name',
          'users.photo_url'
        )
        .orderBy('community_posts.created_at', 'desc')
        .limit(10)
    ]);
    res.json({ members, posts });
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

// ── Daily quest (deterministic per day; localized on the client) ──
router.get(
  '/daily-quest',
  asyncHandler(async (req, res) => {
    const dayIndex = Math.floor(Date.now() / 86400000);
    res.json({ index: dayIndex });
  })
);

// ── Weekly recap (personal) ─────────────────────────
router.get(
  '/recap',
  asyncHandler(async (req, res) => {
    const weekStart = startOfWeek(todayISO());
    const challenge = await getActiveChallenge();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: req.user.id, challenge_id: challenge.id }).first()
      : null;
    if (!enrollment) return res.json({ recap: null });

    const [actRows, badges] = await Promise.all([
      db('challenge_activities')
        .where({ enrollment_id: enrollment.id })
        .where('date', '>=', weekStart)
        .select('date')
        .sum({ total: 'quantity' }),
      db('user_badges')
        .join('badges', 'badges.id', 'user_badges.badge_id')
        .where({ 'user_badges.user_id': req.user.id })
        .where('user_badges.earned_at', '>=', `${weekStart} 00:00:00`)
        .select('badges.name', 'badges.icon')
    ]);
    const checkIns = actRows.length;
    const distance = Math.round((Number(actRows.reduce((a, r) => a + Number(r.total || 0), 0)) || 0) * 100) / 100;
    const days = new Set(actRows.map((r) => r.date)).size;
    res.json({
      recap: {
        weekStart,
        checkIns,
        distance,
        days,
        badges: badges.map((b) => ({ name: b.name, icon: b.icon }))
      }
    });
  })
);

// ── Weekly digest (community highlights) ─────────────
router.get(
  '/digest',
  asyncHandler(async (req, res) => {
    const weekStart = startOfWeek(todayISO());
    const [checkIns, milestones, finishes] = await Promise.all([
      db('challenge_activities').where('date', '>=', weekStart).countDistinct({ c: 'enrollment_id' }).first(),
      db('milestones').where('reached_at', '>=', `${weekStart} 00:00:00`).count({ c: '*' }).first(),
      db('enrollments').where('completed_at', '>=', `${weekStart} 00:00:00`).count({ c: '*' }).first()
    ]);
    res.json({
      digest: {
        checkIns: Number(checkIns.c),
        milestones: Number(milestones.c),
        finishes: Number(finishes.c)
      }
    });
  })
);

// ── Events ──────────────────────────────────────────
router.get(
  '/events/upcoming',
  asyncHandler(async (req, res) => {
    const rows = await db('events').where({ status: 'upcoming' }).orderBy('starts_at', 'asc').limit(10);
    const events = [];
    for (const e of rows) {
      const participants = await db('event_participants').where({ event_id: e.id }).select('user_id');
      const ids = participants.map((p) => p.user_id);
      events.push({
        id: e.id,
        title: e.title,
        description: e.description,
        startsAt: e.starts_at,
        link: e.link,
        rsvps: ids.length,
        joined: ids.includes(req.user.id)
      });
    }
    res.json({ events });
  })
);

router.post(
  '/events/:id/rsvp',
  cheerLimiter,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const event = await db('events').where({ id }).first();
    if (!event) throw new AppError('Event not found', 404);
    const existing = await db('event_participants').where({ event_id: id, user_id: req.user.id }).first();
    if (existing) {
      await db('event_participants').where({ id: existing.id }).del();
      return res.json({ joined: false });
    }
    await db('event_participants').insert({ event_id: id, user_id: req.user.id });
    res.json({ joined: true });
  })
);

router.post(
  '/events',
  asyncHandler(async (req, res) => {
    if (!req.isAdmin) throw new AppError('Admins only', 403);
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(500).optional(),
        starts_at: z.string().trim().min(1).max(30),
        link: z.string().trim().max(300).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid event', 400);
    const [id] = await db('events').insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      starts_at: parsed.data.starts_at,
      link: parsed.data.link || null,
      status: 'upcoming',
      created_by: req.user.id
    });
    res.status(201).json({ message: 'Event created', id });
  })
);

// ── Cross-post a check-in to the Telegram group (opt-in) ──
router.post(
  '/posts/:id/crosspost-telegram',
  asyncHandler(async (req, res) => {
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) throw new AppError('Post not found', 404);
    if (post.user_id !== req.user.id && !req.isAdmin) throw new AppError('Not allowed', 403);
    if (post.type !== 'check_in') throw new AppError('Only check-ins can be shared', 400);
    const user = await db('users').where({ id: post.user_id }).first();
    const body = [user.name, post.body ? ` — ${post.body}` : '', post.distance != null ? ` — ${post.distance} km` : ''].join('');
    telegramMessenger.sendToGroup(`📣 ${body.slice(0, 200)}`);
    res.json({ message: 'Posted to Telegram' });
  })
);

module.exports = router;