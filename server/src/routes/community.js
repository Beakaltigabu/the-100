const express = require('express');
const z = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errors');
const { todayISO, startOfWeek } = require('../lib/dates');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { postLimiter } = require('../middleware/rateLimit');
const { computeStreaks } = require('../services/streaks');

const router = express.Router();

router.use(requireAuth);

const postSchema = z.object({
  body: z.string().trim().min(1).max(500)
});

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const today = todayISO();
    const weekStart = startOfWeek(today);

    const members = await db('users').count({ c: '*' }).first();
    const joinedThisWeek = await db('users').where('created_at', '>=', `${weekStart} 00:00:00`).count({ c: '*' }).first();
    const checkedInToday = await db('challenge_activities')
      .where({ date: today })
      .countDistinct({ c: 'enrollment_id' })
      .first();
    const milestonesThisWeek = await db('milestones')
      .where('reached_at', '>=', `${weekStart} 00:00:00`)
      .count({ c: '*' })
      .first();
    const finishers = await db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first();
    const active = await db('enrollments')
      .whereIn('status', ['committed', 'active'])
      .countDistinct({ c: 'user_id' })
      .first();

    res.json({
      stats: {
        members: Number(members.c),
        active: Number(active.c),
        joinedThisWeek: Number(joinedThisWeek.c),
        checkedInToday: Number(checkedInToday.c),
        milestonesThisWeek: Number(milestonesThisWeek.c),
        finishers: Number(finishers.c)
      }
    });
  })
);

router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    // THE 100's own celebration events + member posts, newest first.
    const milestones = await db('milestones')
      .join('enrollments', 'enrollments.id', 'milestones.enrollment_id')
      .join('users', 'users.id', 'enrollments.user_id')
      .whereNotNull('milestones.reached_at')
      .select('users.name', 'milestones.threshold', 'milestones.reached_at as ts', 'enrollments.activity_type')
      .orderBy('milestones.reached_at', 'desc')
      .limit(25);

    const finishes = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .whereNotNull('enrollments.completed_at')
      .select('users.name', 'enrollments.completed_at as ts', 'enrollments.activity_type', 'enrollments.goal_value')
      .orderBy('enrollments.completed_at', 'desc')
      .limit(15);

    const joins = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .select('users.name', 'enrollments.created_at as ts', 'enrollments.activity_type', 'enrollments.goal_value')
      .orderBy('enrollments.created_at', 'desc')
      .limit(15);

    const postRows = await db('community_posts')
      .join('users', 'users.id', 'community_posts.user_id')
      .select(
        'community_posts.id',
        'community_posts.user_id',
        'community_posts.body',
        'community_posts.created_at as ts',
        'users.name'
      )
      .orderBy('community_posts.created_at', 'desc')
      .limit(30);

    const cheerRows = await db('post_cheers')
      .whereIn(
        'post_id',
        postRows.map((p) => p.id)
      )
      .select('post_id', 'user_id');
    const cheerCounts = {};
    const cheered = {};
    for (const c of cheerRows) {
      cheerCounts[c.post_id] = (cheerCounts[c.post_id] || 0) + 1;
      if (c.user_id === req.user.id) cheered[c.post_id] = true;
    }

    const streaks = await computeStreaks();
    const nowTs = new Date().toISOString();

    const events = [];
    for (const p of postRows) {
      events.push({
        kind: 'post',
        id: p.id,
        userId: p.user_id,
        name: p.name,
        body: p.body,
        ts: p.ts,
        cheers: cheerCounts[p.id] || 0,
        cheered: !!cheered[p.id],
        isMine: p.user_id === req.user.id
      });
    }
    for (const m of milestones) {
      events.push({
        kind: 'milestone',
        name: m.name,
        ts: m.ts,
        threshold: Number(m.threshold),
        unit: UNIT_LABEL[unitForActivity(m.activity_type)] || 'KM'
      });
    }
    for (const f of finishes) {
      events.push({
        kind: 'finish',
        name: f.name,
        ts: f.ts,
        goal: Number(f.goal_value),
        unit: UNIT_LABEL[unitForActivity(f.activity_type)] || 'KM'
      });
    }
    for (const j of joins) {
      events.push({
        kind: 'join',
        name: j.name,
        ts: j.ts,
        goal: Number(j.goal_value),
        unit: UNIT_LABEL[unitForActivity(j.activity_type)] || 'KM'
      });
    }
    for (const s of streaks) {
      events.push({ kind: 'streak', name: s.name, ts: nowTs, days: s.days });
    }

    events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    res.json({ events: events.slice(0, 60) });
  })
);

router.post(
  '/posts',
  postLimiter,
  asyncHandler(async (req, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Post must be 1–500 characters', 400, parsed.error.flatten());
    }
    const [id] = await db('community_posts').insert({ user_id: req.user.id, body: parsed.data.body });
    res.status(201).json({ message: 'Posted', postId: id });
  })
);

router.post(
  '/posts/:id/cheer',
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.id);
    const post = await db('community_posts').where({ id: postId }).first();
    if (!post) {
      throw new AppError('Post not found', 404);
    }
    const existing = await db('post_cheers').where({ post_id: postId, user_id: req.user.id }).first();
    if (existing) {
      await db('post_cheers').where({ id: existing.id }).del();
    } else {
      await db('post_cheers').insert({ post_id: postId, user_id: req.user.id });
    }
    const count = await db('post_cheers').where({ post_id: postId }).count({ c: '*' }).first();
    res.json({ cheers: Number(count.c), cheered: !existing });
  })
);

router.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) {
      throw new AppError('Post not found', 404);
    }
    if (post.user_id !== req.user.id && !req.isAdmin) {
      throw new AppError('Not allowed to delete this post', 403);
    }
    await db('community_posts').where({ id: post.id }).del();
    res.json({ message: 'Deleted' });
  })
);

module.exports = router;