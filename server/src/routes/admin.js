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
const {
  createBroadcast,
  updateBroadcast,
  publishBroadcast,
  endBroadcast,
  softDeleteBroadcast,
  listBroadcasts,
  countTargets
} = require('../services/broadcast');
const { BROADCAST_CHANNELS, BROADCAST_TYPES, BROADCAST_STATUS, BROADCAST_PLACEMENTS } = require('../constants');

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
    const search = req.query.search ? String(req.query.search).trim().slice(0, 100) : '';
    const challenge = await getActiveChallenge();
    const challengeId = challenge ? challenge.id : 0;
    const totalRow = await db('enrollments').where({ challenge_id: challengeId }).count({ c: '*' }).first();
    const rows = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .leftJoin('telegram_connections', 'telegram_connections.user_id', 'enrollments.user_id')
      .leftJoin('strava_connections', 'strava_connections.user_id', 'enrollments.user_id')
      .where({ 'enrollments.challenge_id': challengeId })
      .modify((q) => {
        if (search) q.where((b) => b.where('users.name', 'like', `%${search}%`).orWhere('users.email', 'like', `%${search}%`));
      })
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
    const adminRow = await db('admins').where({ user_id: user.id }).first();

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
        otherActivity: user.other_activity || null,
        language: user.language || 'en',
        banned: !!user.banned_at,
        isAdmin: !!adminRow
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

// ── User management ───────────────────────────────────
router.patch(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim().slice(0, 80);
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim().toLowerCase();
      if (email && email !== user.email) {
        const exists = await db('users').where({ email }).whereNot({ id: user.id }).first();
        if (exists) return res.status(409).json({ error: 'Email already in use' });
        updates.email = email;
      }
    }
    if (req.body.language !== undefined && ['en', 'am'].includes(req.body.language)) updates.language = req.body.language;
    if (req.body.experience_level !== undefined) updates.experience_level = String(req.body.experience_level).slice(0, 30);
    if (req.body.weekly_baseline !== undefined) updates.weekly_baseline = req.body.weekly_baseline === null ? null : Number(req.body.weekly_baseline);
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
    await db('users').where({ id: user.id }).update(updates);
    audit(req.user.id, 'member_update', 'user', user.id, req.ip);
    res.json({ message: 'Updated' });
  })
);

router.post(
  '/members/:id/ban',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    await db('users').where({ id: user.id }).update({ banned_at: db.fn.now() });
    audit(req.user.id, 'member_ban', 'user', user.id, req.ip);
    res.json({ message: 'Banned' });
  })
);

router.post(
  '/members/:id/unban',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    await db('users').where({ id: user.id }).update({ banned_at: null });
    audit(req.user.id, 'member_unban', 'user', user.id, req.ip);
    res.json({ message: 'Unbanned' });
  })
);

router.delete(
  '/members/:id',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here' });
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
    audit(req.user.id, 'member_delete', 'user', user.id, req.ip);
    res.json({ message: 'Member deleted' });
  })
);

router.post(
  '/members/:id/admin',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const existing = await db('admins').where({ user_id: user.id }).first();
    if (!existing) await db('admins').insert({ user_id: user.id, role: 'admin' });
    audit(req.user.id, 'grant_admin', 'user', user.id, req.ip);
    res.json({ message: 'Granted admin' });
  })
);

router.post(
  '/members/:id/remove-admin',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    await db('admins').where({ user_id: user.id }).del();
    audit(req.user.id, 'revoke_admin', 'user', user.id, req.ip);
    res.json({ message: 'Removed admin' });
  })
);

// ── Analytics ─────────────────────────────────────────
router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 3600 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 3600 * 1000);
    const seriesSince = new Date(now - 29 * 24 * 3600 * 1000);

    const [dau, wau, mau, totalUsers, onboarded, newUsers30, enrolled, activeMembers, completed, activitySeries, userSeries] = await Promise.all([
      db('request_logs').where('created_at', '>=', dayAgo).countDistinct({ c: 'user_id' }).first(),
      db('request_logs').where('created_at', '>=', weekAgo).countDistinct({ c: 'user_id' }).first(),
      db('request_logs').where('created_at', '>=', monthAgo).countDistinct({ c: 'user_id' }).first(),
      db('users').count({ c: '*' }).first(),
      db('users').where({ onboarding_complete: true }).count({ c: '*' }).first(),
      db('users').where('created_at', '>=', monthAgo).count({ c: '*' }).first(),
      db('enrollments').count({ c: '*' }).first(),
      db('enrollments').whereIn('status', ['committed', 'active']).countDistinct({ c: 'user_id' }).first(),
      db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first(),
      db('challenge_activities')
        .where('date', '>=', seriesSince.toISOString().slice(0, 10))
        .select(db.raw('DATE(date) as d'))
        .count({ c: '*' })
        .sum({ km: 'quantity' })
        .groupByRaw('DATE(date)'),
      db('users')
        .where('created_at', '>=', seriesSince)
        .select(db.raw('DATE(created_at) as d'))
        .count({ c: '*' })
        .groupByRaw('DATE(created_at)')
    ]);

    res.json({
      dau: Number(dau.c),
      wau: Number(wau.c),
      mau: Number(mau.c),
      totalUsers: Number(totalUsers.c),
      onboarded: Number(onboarded.c),
      newUsers30d: Number(newUsers30.c),
      enrolled: Number(enrolled.c),
      activeMembers: Number(activeMembers.c),
      completed: Number(completed.c),
      funnel: {
        registered: Number(totalUsers.c),
        onboarded: Number(onboarded.c),
        enrolled: Number(enrolled.c),
        active: Number(activeMembers.c),
        completed: Number(completed.c)
      },
      activitySeries: activitySeries.map((r) => ({ day: r.d, count: Number(r.c), km: Math.round(Number(r.km || 0) * 100) / 100 })),
      userSeries: userSeries.map((r) => ({ day: r.d, count: Number(r.c) }))
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

// ── Broadcast ─────────────────────────────────────────
function parseBroadcastBody(body) {
  const title = body && body.title ? String(body.title).trim() : '';
  const bodyText = body && body.body ? String(body.body).trim() : '';
  const type = BROADCAST_TYPES.includes(body && body.type) ? body.type : 'announcement';
  const placement = BROADCAST_PLACEMENTS.includes(body && body.placement) ? body.placement : 'app';
  let channels = Array.isArray(body && body.channels) && body.channels.length ? body.channels : ['inapp', 'telegram', 'group'];
  channels = channels.filter((c) => BROADCAST_CHANNELS.includes(c));
  const targeting = body && body.targeting && typeof body.targeting === 'object' ? body.targeting : { mode: 'all' };
  const scheduleAt = body && body.scheduleAt ? new Date(body.scheduleAt) : null;
  const priority = body && body.priority != null ? Number(body.priority) : 0;
  return {
    title,
    bodyText,
    titleAm: body && body.title_am ? String(body.title_am).trim() : null,
    bodyAm: body && body.body_am ? String(body.body_am).trim() : null,
    type,
    placement,
    channels,
    targeting,
    scheduleAt: scheduleAt && !Number.isNaN(scheduleAt.getTime()) ? scheduleAt : null,
    priority
  };
}

function serializeBroadcastRow(b) {
  return {
    id: b.id,
    type: b.type,
    title: b.title,
    body: b.body,
    title_am: b.title_am,
    body_am: b.body_am,
    channels: (b.channels || '').split(',').filter(Boolean),
    placement: b.placement,
    priority: Number(b.priority) || 0,
    status: b.status,
    target: b.target,
    targeting: b.targeting ? safeParse(b.targeting) : { mode: 'all' },
    scheduledAt: b.scheduled_at,
    publishedAt: b.published_at,
    endedAt: b.ended_at,
    groupSent: !!b.group_sent,
    adminName: b.admin_name || null,
    createdAt: b.created_at
  };
}

function safeParse(s) {
  if (s == null) return { mode: 'all' };
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return { mode: 'all' }; }
}

router.get(
  '/broadcasts',
  asyncHandler(async (req, res) => {
    const status = req.query.status && BROADCAST_STATUS.includes(req.query.status) ? req.query.status : null;
    const rows = await listBroadcasts({ status, limit: req.query.limit ? parseInt(req.query.limit, 10) : 50 });
    const ids = rows.map((b) => b.id);
    const recipients = ids.length
      ? await db('broadcast_recipients')
          .whereIn('broadcast_id', ids)
          .groupBy('broadcast_id', 'channel')
          .select('broadcast_id', 'channel')
          .count({ c: '*' })
      : [];
    const deliveryById = {};
    for (const r of recipients) {
      deliveryById[r.broadcast_id] = deliveryById[r.broadcast_id] || { inapp: 0, telegram: 0 };
      deliveryById[r.broadcast_id][r.channel === 'inapp' ? 'inapp' : 'telegram'] = Number(r.c);
    }
    res.json({
      broadcasts: rows.map((b) => ({
        ...serializeBroadcastRow(b),
        delivery: deliveryById[b.id] || { inapp: 0, telegram: 0 }
      }))
    });
  })
);

router.post(
  '/broadcasts/estimate',
  asyncHandler(async (req, res) => {
    const targeting = (req.body && req.body.targeting) || { mode: 'all' };
    const count = await countTargets(targeting);
    res.json({ count });
  })
);

router.post(
  '/broadcasts',
  asyncHandler(async (req, res) => {
    const p = parseBroadcastBody(req.body);
    if (!p.title) return res.status(400).json({ error: 'Title is required' });
    if (!p.bodyText) return res.status(400).json({ error: 'Body is required' });
    if (!p.channels.length) return res.status(400).json({ error: 'Pick at least one channel' });

    const id = await createBroadcast({
      adminId: req.user.id,
      type: p.type,
      title: p.title,
      body: p.bodyText,
      titleAm: p.titleAm,
      bodyAm: p.bodyAm,
      channels: p.channels,
      targeting: p.targeting,
      placement: p.placement,
      priority: p.priority,
      scheduleAt: p.scheduleAt,
      draft: req.body && req.body.draft === true,
      endPrevious: req.body && req.body.endPrevious === true
    });

    if (id && id.conflict) {
      return res.status(409).json({ error: 'Another broadcast is live', conflict: id.conflict });
    }

    audit(req.user.id, 'broadcast_create', 'broadcast', id.id, req.ip);
    res.status(201).json({ message: p.scheduleAt ? 'Broadcast scheduled' : 'Broadcast sent', id: id.id });
  })
);

router.patch(
  '/broadcasts/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const patch = {};
    if (req.body.type !== undefined) patch.type = BROADCAST_TYPES.includes(req.body.type) ? req.body.type : undefined;
    if (req.body.title !== undefined) patch.title = String(req.body.title).slice(0, 160);
    if (req.body.body !== undefined) patch.body = String(req.body.body).slice(0, 5000);
    if (req.body.title_am !== undefined) patch.title_am = req.body.title_am ? String(req.body.title_am).slice(0, 160) : null;
    if (req.body.body_am !== undefined) patch.body_am = req.body.body_am ? String(req.body.body_am).slice(0, 5000) : null;
    if (req.body.channels !== undefined) {
      patch.channels = Array.isArray(req.body.channels) ? req.body.channels.filter((c) => BROADCAST_CHANNELS.includes(c)) : undefined;
    }
    if (req.body.placement !== undefined) patch.placement = BROADCAST_PLACEMENTS.includes(req.body.placement) ? req.body.placement : undefined;
    if (req.body.priority !== undefined) patch.priority = Number(req.body.priority) || 0;
    if (req.body.targeting !== undefined) patch.targeting = req.body.targeting;

    const result = await updateBroadcast(id, patch);
    if (result === null) return res.status(404).json({ error: 'Broadcast not found' });
    if (result === 'locked') return res.status(409).json({ error: 'Only draft or live broadcasts can be edited' });

    audit(req.user.id, 'broadcast_update', 'broadcast', id, req.ip);
    res.json({ message: 'Updated', broadcast: serializeBroadcastRow(result) });
  })
);

router.post(
  '/broadcasts/:id/publish',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const result = await publishBroadcast(id, { endPrevious: req.body && req.body.endPrevious === true });
    if (result === null) return res.status(404).json({ error: 'Broadcast not found' });
    if (result === 'locked') return res.status(409).json({ error: 'Only draft or scheduled broadcasts can be published' });
    if (result && result.conflict) {
      return res.status(409).json({ error: 'Another broadcast is live', conflict: result.conflict });
    }
    audit(req.user.id, 'broadcast_publish', 'broadcast', id, req.ip);
    res.json({ message: 'Broadcast is now live', broadcast: serializeBroadcastRow(result) });
  })
);

router.post(
  '/broadcasts/:id/end',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const result = await endBroadcast(id);
    if (!result) return res.status(404).json({ error: 'Broadcast not found or not live' });
    audit(req.user.id, 'broadcast_end', 'broadcast', id, req.ip);
    res.json({ message: 'Broadcast ended', broadcast: serializeBroadcastRow(result) });
  })
);

router.delete(
  '/broadcasts/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const ok = await softDeleteBroadcast(id);
    if (!ok) return res.status(404).json({ error: 'Broadcast not found' });
    audit(req.user.id, 'broadcast_delete', 'broadcast', id, req.ip);
    res.json({ message: 'Broadcast deleted' });
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