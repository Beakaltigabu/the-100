const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { dayNumber, enrollmentStatus } = require('../services/progress');
const { unitForActivity } = require('../constants');
const { todayISO } = require('../lib/dates');
const { APP_TIMEZONE } = require('../lib/dates');
const { audit } = require('../lib/audit');
const { queued } = require('../services/logger');
const { backlog } = require('../services/queue');
const { getActiveChallenge } = require('../services/challengeWindow');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Pagination helper shared by the log endpoints.
function pageParams(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit };
}

// Admin stats are expensive aggregates over the whole DB and change slowly —
// cache briefly (disabled under test so fixtures stay visible).
const STATS_TTL_MS = 30 * 1000;
let statsCache = null;
let statsCachedAt = 0;

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const cacheable = config.env !== 'test';
    if (cacheable && statsCache && Date.now() - statsCachedAt < STATS_TTL_MS) {
      return res.json(statsCache);
    }
    const members = await db('users').count({ c: '*' }).first();
    const active = await db('enrollments')
      .whereIn('status', ['committed', 'active'])
      .countDistinct({ c: 'user_id' })
      .first();
    const telegramConnected = await db('telegram_connections').where({ state: 'active' }).count({ c: '*' }).first();
    const stravaConnected = await db('strava_connections').where({ status: 'connected' }).count({ c: '*' }).first();
    const completed = await db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first();
    const totalValue = await db('challenge_activities').sum({ s: 'quantity' }).first();

    const payload = {
      stats: {
        members: Number(members.c),
        active: Number(active.c),
        telegramConnected: Number(telegramConnected.c),
        stravaConnected: Number(stravaConnected.c),
        completed: Number(completed.c),
        totalValue: Math.round(Number(totalValue.s) * 100) / 100 || 0
      }
    };
    if (cacheable) {
      statsCache = payload;
      statsCachedAt = Date.now();
    }
    res.json(payload);
  })
);

router.get(
  '/members',
  asyncHandler(async (req, res) => {
    // Bounded: default page size is generous enough for the current community,
    // but the endpoint can never return an unbounded member list.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const challenge = await getActiveChallenge();
    const challengeId = challenge ? challenge.id : 0;
    const totalRow = await db('enrollments').where({ challenge_id: challengeId }).count({ c: '*' }).first();
    const rows = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .leftJoin('telegram_connections', 'telegram_connections.user_id', 'enrollments.user_id')
      .leftJoin('strava_connections', 'strava_connections.user_id', 'enrollments.user_id')
      .where({ 'enrollments.challenge_id': challengeId })
      .select(
        'enrollments.id as enrollment_id',
        'users.id as user_id',
        'users.name',
        'users.email',
        'users.created_at as joined',
        'enrollments.goal_value',
        'enrollments.activity_type',
        'enrollments.status',
        'enrollments.start_date',
        'telegram_connections.state as telegram_state',
        'strava_connections.status as strava_status'
      )
      .orderBy('enrollments.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    // Batch the per-member aggregates into 2 grouped queries (kills the N+1).
    const enrollmentIds = rows.map((r) => r.enrollment_id);
    const totalRows = enrollmentIds.length
      ? await db('challenge_activities')
          .whereIn('enrollment_id', enrollmentIds)
          .groupBy('enrollment_id')
          .select('enrollment_id')
          .sum({ total: 'quantity' })
      : [];
    const lastRows = enrollmentIds.length
      ? await db('challenge_activities')
          .whereIn('enrollment_id', enrollmentIds)
          .groupBy('enrollment_id')
          .select('enrollment_id')
          .max({ last: 'date' })
      : [];
    const totalById = {};
    const lastById = {};
    for (const r of totalRows) totalById[r.enrollment_id] = Number(r.total) || 0;
    for (const r of lastRows) lastById[r.enrollment_id] = r.last;

    const today = todayISO();
    const startDate = challenge ? challenge.start_date : null;

    const members = rows.map((row) => {
      const total = totalById[row.enrollment_id] || 0;
      const last = lastById[row.enrollment_id] || null;
      const day = dayNumber(startDate || row.start_date, today);
      const status = enrollmentStatus(
        { status: row.status, goal_value: row.goal_value, start_date: row.start_date },
        total,
        last
      );
      return {
        id: row.user_id,
        name: row.name,
        email: row.email,
        joined: row.joined,
        goalValue: Number(row.goal_value),
        goalUnit: unitForActivity(row.activity_type),
        progress: Math.round(total * 100) / 100,
        day,
        status,
        telegram: row.telegram_state === 'active',
        strava: row.strava_status === 'connected'
      };
    });

    res.json({ members, total: Number(totalRow.c), page, limit });
  })
);

router.get(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'Member not found' });
    }
    audit(req.user.id, 'view_member', 'user', user.id, req.ip);
    const challenge = await getActiveChallenge();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: user.id, challenge_id: challenge.id }).first()
      : null;

    const activities = enrollment
      ? await db('challenge_activities').where({ enrollment_id: enrollment.id }).orderBy('date', 'desc').limit(50)
      : [];

    const telegram = await db('telegram_connections').where({ user_id: user.id }).first();
    const strava = await db('strava_connections').where({ user_id: user.id }).first();

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        joined: user.created_at,
        location: user.location,
        age: user.age,
        experienceLevel: user.experience_level,
        weeklyBaseline: Number(user.weekly_baseline) || null,
        activityType: user.activity_type,
        otherActivity: user.other_activity || null
      },
      enrollment: enrollment
        ? {
            goalValue: Number(enrollment.goal_value),
            goalUnit: unitForActivity(enrollment.activity_type),
            status: enrollment.status,
            startDate: enrollment.start_date,
            endDate: enrollment.end_date
          }
        : null,
      activities: activities.map((a) => ({
        id: a.id,
        date: a.date,
        quantity: Number(a.quantity),
        activityType: a.activity_type,
        source: a.source
      })),
      integrations: {
        telegram: telegram ? { state: telegram.state } : { state: 'not_connected' },
        strava: strava ? { status: strava.status } : { status: 'not_connected' }
      }
    });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const rows = await db('admin_audit_log')
      .join('users', 'users.id', 'admin_audit_log.admin_user_id')
      .select(
        'admin_audit_log.id',
        'admin_audit_log.action',
        'admin_audit_log.target_type',
        'admin_audit_log.target_id',
        'admin_audit_log.ip',
        'admin_audit_log.created_at as ts',
        'users.name'
      )
      .orderBy('admin_audit_log.created_at', 'desc')
      .limit(100);
    res.json({ entries: rows });
  })
);

// ── Community moderation (MVP) ───────────────────────
router.get(
  '/community/reports',
  asyncHandler(async (req, res) => {
    const rows = await db('community_reports')
      .join('community_posts', 'community_posts.id', 'community_reports.post_id')
      .join('users as poster', 'poster.id', 'community_posts.user_id')
      .join('users as reporter', 'reporter.id', 'community_reports.reporter_id')
      .where({ 'community_reports.status': 'open' })
      .select(
        'community_reports.id',
        'community_reports.reason',
        'community_reports.created_at as ts',
        'community_posts.id as post_id',
        'community_posts.body',
        'community_posts.status as post_status',
        'poster.name as poster',
        'reporter.name as reporter'
      )
      .orderBy('community_reports.created_at', 'desc')
      .limit(100);
    res.json({ reports: rows });
  })
);

router.post(
  '/community/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    await db('community_reports').where({ id: req.params.id }).update({ status: 'resolved' });
    audit(req.user.id, 'resolve_report', 'community_report', req.params.id, req.ip);
    res.json({ message: 'Resolved' });
  })
);

router.post(
  '/community/posts/:id/hide',
  asyncHandler(async (req, res) => {
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await db('community_posts').where({ id: post.id }).update({ status: 'hidden', updated_at: db.fn.now() });
    audit(req.user.id, 'hide_post', 'community_post', post.id, req.ip);
    res.json({ message: 'Hidden' });
  })
);

router.post(
  '/community/posts/:id/remove',
  asyncHandler(async (req, res) => {
    const post = await db('community_posts').where({ id: req.params.id }).first();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await db('community_posts').where({ id: post.id }).update({ status: 'removed', updated_at: db.fn.now() });
    audit(req.user.id, 'remove_post', 'community_post', post.id, req.ip);
    res.json({ message: 'Removed' });
  })
);

router.post(
  '/community/announcements',
  asyncHandler(async (req, res) => {
    const { title, body, pinned } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
    const challenge = await getActiveChallenge();
    const [id] = await db('community_announcements').insert({
      title: String(title).trim().slice(0, 160),
      body: body ? String(body).slice(0, 1000) : null,
      challenge_id: challenge ? challenge.id : null,
      status: 'published',
      pinned_at: pinned ? db.fn.now() : null,
      published_at: db.fn.now()
    });
    audit(req.user.id, 'create_announcement', 'community_announcement', id, req.ip);
    res.status(201).json({ message: 'Published', id });
  })
);

router.post(
  '/community/announcements/:id/pin',
  asyncHandler(async (req, res) => {
    await db('community_announcements').where({ id: req.params.id }).update({ pinned_at: db.fn.now() });
    audit(req.user.id, 'pin_announcement', 'community_announcement', req.params.id, req.ip);
    res.json({ message: 'Pinned' });
  })
);

router.post(
  '/community/announcements/:id/hide',
  asyncHandler(async (req, res) => {
    await db('community_announcements').where({ id: req.params.id }).update({ status: 'hidden' });
    audit(req.user.id, 'hide_announcement', 'community_announcement', req.params.id, req.ip);
    res.json({ message: 'Hidden' });
  })
);

router.get(
  '/system',
  asyncHandler(async (req, res) => {
    const mem = process.memoryUsage();
    let dbOk = false;
    try {
      await db.raw('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const [requests, errors, events] = await Promise.all([
      db('request_logs').count({ c: '*' }).first(),
      db('error_logs').count({ c: '*' }).first(),
      db('event_logs').count({ c: '*' }).first()
    ]);
    res.json({
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      env: config.env,
      timezone: APP_TIMEZONE,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal
      },
      dbOk,
      queueBacklog: backlog(),
      pendingLogWrites: queued(),
      logCounts: {
        requests: Number(requests.c),
        errors: Number(errors.c),
        events: Number(events.c)
      }
    });
  })
);

router.get(
  '/logs/stats',
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const seriesSince = new Date(now - 13 * 24 * 60 * 60 * 1000);

    const [seriesRows, dayCount, dayUsers, buckets, top, dur, p95Rows, errorCount] = await Promise.all([
      db('request_logs')
        .where('created_at', '>=', seriesSince)
        .select(db.raw('DATE(created_at) as d'))
        .count({ c: '*' })
        .countDistinct({ u: 'user_id' })
        .groupByRaw('DATE(created_at)'),
      db('request_logs').where('created_at', '>=', dayAgo).count({ c: '*' }).first(),
      db('request_logs').where('created_at', '>=', dayAgo).countDistinct({ c: 'user_id' }).first(),
      db('request_logs')
        .where('created_at', '>=', dayAgo)
        .select('status')
        .count({ c: '*' })
        .groupBy('status'),
      db('request_logs')
        .where('created_at', '>=', dayAgo)
        .select('path')
        .count({ c: '*' })
        .groupBy('path')
        .orderBy('c', 'desc')
        .limit(10),
      db('request_logs')
        .where('created_at', '>=', dayAgo)
        .select(db.raw('AVG(duration_ms) as avg_ms'), db.raw('MAX(duration_ms) as max_ms'))
        .first(),
      db('request_logs')
        .where('created_at', '>=', dayAgo)
        .orderBy('id', 'desc')
        .limit(1000)
        .select('duration_ms'),
      db('error_logs').where('created_at', '>=', dayAgo).count({ c: '*' }).first()
    ]);

    const durations = p95Rows.map((r) => r.duration_ms).sort((a, b) => a - b);
    const p95 = durations.length
      ? durations[Math.floor(durations.length * 0.95)]
      : 0;

    res.json({
      last24h: {
        requests: Number(dayCount.c),
        users: Number(dayUsers.c),
        errors: Number(errorCount.c),
        avgMs: dur && dur.avg_ms != null ? Math.round(Number(dur.avg_ms)) : 0,
        maxMs: dur && dur.max_ms != null ? Number(dur.max_ms) : 0,
        p95Ms: p95
      },
      statusBuckets: buckets.map((b) => ({ status: b.status, count: Number(b.c) })),
      topPaths: top.map((t) => ({ path: t.path, count: Number(t.c) })),
      daily: seriesRows.map((r) => ({ day: r.d, count: Number(r.c), users: Number(r.u || 0) }))
    });
  })
);

router.get(
  '/logs/requests',
  asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const q = db('request_logs');
    if (req.query.status) q.where({ status: parseInt(req.query.status, 10) });
    if (req.query.source) q.where({ source: String(req.query.source).slice(0, 20) });
    if (req.query.path) q.where('path', 'like', `%${String(req.query.path).slice(0, 100)}%`);
    const totalRow = await q.clone().count({ c: '*' }).first();
    const rows = await q.orderBy('id', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ entries: rows, total: Number(totalRow.c), page, limit });
  })
);

router.get(
  '/logs/errors',
  asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const q = db('error_logs');
    if (req.query.level) q.where({ level: String(req.query.level).slice(0, 10) });
    const totalRow = await q.clone().count({ c: '*' }).first();
    const rows = await q.orderBy('id', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ entries: rows, total: Number(totalRow.c), page, limit });
  })
);

router.get(
  '/logs/events',
  asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const q = db('event_logs');
    if (req.query.source) q.where({ source: String(req.query.source).slice(0, 30) });
    if (req.query.type) q.where('type', 'like', `%${String(req.query.type).slice(0, 60)}%`);
    const totalRow = await q.clone().count({ c: '*' }).first();
    const rows = await q.orderBy('id', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ entries: rows, total: Number(totalRow.c), page, limit });
  })
);

// ── Support inbox ─────────────────────────────────────
router.get(
  '/contact',
  asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const base = db('contact_messages');
    if (req.query.status) base.where({ status: String(req.query.status).slice(0, 20) });
    const totalRow = await base.clone().count({ c: '*' }).first();

    const rows = await db('contact_messages')
      .leftJoin('users', 'users.id', 'contact_messages.user_id')
      .select(
        'contact_messages.id',
        'contact_messages.name',
        'contact_messages.email',
        'contact_messages.message',
        'contact_messages.status',
        'contact_messages.created_at as ts',
        'contact_messages.replied_at',
        'users.name as account_name'
      )
      .modify((q) => {
        if (req.query.status) q.where({ 'contact_messages.status': String(req.query.status).slice(0, 20) });
      })
      .orderBy('contact_messages.id', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({ entries: rows, total: Number(totalRow.c), page, limit });
  })
);

router.post(
  '/contact/:id/status',
  asyncHandler(async (req, res) => {
    const status = String((req.body && req.body.status) || '').slice(0, 20);
    if (!['new', 'replied', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const [id] = [parseInt(req.params.id, 10)];
    const updated = await db('contact_messages')
      .where({ id })
      .update({
        status,
        replied_at: status === 'new' ? null : db.fn.now(),
        updated_at: db.fn.now()
      });
    if (!updated) {
      return res.status(404).json({ error: 'Message not found' });
    }
    audit(req.user.id, 'contact_status', 'contact_message', id, req.ip);
    res.json({ message: 'Updated', id });
  })
);

module.exports = router;