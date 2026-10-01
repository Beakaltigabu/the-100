const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin, signImpersonationToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { dayNumber, enrollmentStatus, enrollmentSummary } = require('../services/progress');
const { unitForActivity } = require('../constants');
const { todayISO } = require('../lib/dates');
const { APP_TIMEZONE } = require('../lib/dates');
const { audit } = require('../lib/audit');
const { queued } = require('../services/logger');
const { backlog } = require('../services/queue');
const { runScheduledJobs, checkStravaSync, pruneLogs } = require('../services/scheduler');
const mysql = require('mysql2/promise');
const { getActiveChallenge } = require('../services/challengeWindow');
const { createNotification } = require('../services/notifications');
const telegramMessenger = require('../services/telegramMessenger');
const passwordReset = require('../services/passwordReset');
const botMessages = require('../services/botMessages');
const {
  createBroadcast,
  updateBroadcast,
  publishBroadcast,
  endBroadcast,
  softDeleteBroadcast,
  restoreBroadcast,
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

// Apply an inclusive date-range filter (from/to as YYYY-MM-DD) on a datetime
// column. Bounded: only ever applies one range.
function dateRange(q, col, query) {
  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  if (from && to) q.whereBetween(col, [`${from} 00:00:00`, `${to} 23:59:59`]);
  else if (from) q.where(col, '>=', `${from} 00:00:00`);
  else if (to) q.where(col, '<=', `${to} 23:59:59`);
  return q;
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
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const search = req.query.search ? String(req.query.search).trim().slice(0, 100) : '';
    const fStrava = req.query.strava === '1';
    const fTelegram = req.query.telegram === '1';
    const fInstalled = req.query.installed === '1';
    const fActive = req.query.active === '1';
    const challenge = await getActiveChallenge();
    const challengeId = challenge ? challenge.id : 0;
    const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // All users (left-join enrollment/connections) so admins see everyone,
    // including those who installed or connected but haven't enrolled yet.
    const build = () =>
      db('users')
        .leftJoin('enrollments', function () {
          this.on('enrollments.user_id', 'users.id').andOn('enrollments.challenge_id', challengeId);
        })
        .leftJoin('telegram_connections', 'telegram_connections.user_id', 'users.id')
        .leftJoin('strava_connections', 'strava_connections.user_id', 'users.id')
        .modify((q) => {
          if (search) q.where((b) => b.where('users.name', 'like', `%${search}%`).orWhere('users.email', 'like', `%${search}%`));
          if (fStrava) q.where('strava_connections.status', 'connected');
          if (fTelegram) q.where('telegram_connections.state', 'active');
          if (fInstalled) q.where('users.pwa_installed', true);
          if (fActive) {
            q.whereExists(
              db('challenge_activities')
                .join('enrollments as e2', 'e2.id', 'challenge_activities.enrollment_id')
                .whereRaw('e2.user_id = users.id')
                .where('challenge_activities.date', '>=', since7)
            );
          }
          dateRange(q, 'users.created_at', req.query);
        });

    const totalRow = await build().clearSelect().countDistinct({ c: 'users.id' }).first();
    const rows = await build()
      .select(
        'users.id as user_id',
        'users.name',
        'users.email',
        'users.created_at as joined',
        'users.pwa_installed',
        'users.banned_at',
        'enrollments.id as enrollment_id',
        'enrollments.goal_value',
        'enrollments.activity_type',
        'enrollments.status',
        'enrollments.start_date',
        'telegram_connections.state as telegram_state',
        'strava_connections.status as strava_status'
      )
      .orderBy('users.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    const enrollmentIds = rows.map((r) => r.enrollment_id).filter(Boolean);
    const userIds = rows.map((r) => r.user_id);
    const [totalRows, lastRows, lastSeenRows, sessionRows] = await Promise.all([
      enrollmentIds.length
        ? db('challenge_activities').whereIn('enrollment_id', enrollmentIds).groupBy('enrollment_id').select('enrollment_id').sum({ total: 'quantity' })
        : [],
      enrollmentIds.length
        ? db('challenge_activities').whereIn('enrollment_id', enrollmentIds).groupBy('enrollment_id').select('enrollment_id').max({ last: 'date' })
        : [],
      userIds.length
        ? db('request_logs').whereIn('user_id', userIds).groupBy('user_id').select('user_id').max({ lastSeen: 'created_at' })
        : [],
      userIds.length
        ? db('session_logs').whereIn('user_id', userIds).groupBy('user_id').select('user_id').sum({ sessionSeconds: 'duration_seconds' })
        : []
    ]);
    const totalById = {};
    const lastById = {};
    const lastSeenById = {};
    const sessionById = {};
    for (const r of totalRows) totalById[r.enrollment_id] = Number(r.total) || 0;
    for (const r of lastRows) lastById[r.enrollment_id] = r.last;
    for (const r of lastSeenRows) lastSeenById[r.user_id] = r.lastSeen;
    for (const r of sessionRows) sessionById[r.user_id] = Number(r.sessionSeconds) || 0;

    const today = todayISO();
    const startDate = challenge ? challenge.start_date : null;

    const members = rows.map((row) => {
      const enrolled = !!row.enrollment_id;
      const total = totalById[row.enrollment_id] || 0;
      const last = lastById[row.enrollment_id] || null;
      const day = enrolled ? dayNumber(startDate || row.start_date, today) : null;
      const status = enrolled
        ? enrollmentStatus({ status: row.status, goal_value: row.goal_value, start_date: row.start_date }, total, last)
        : 'not_enrolled';
      return {
        id: row.user_id,
        name: row.name,
        email: row.email,
        joined: row.joined,
        goalValue: enrolled ? Number(row.goal_value) : null,
        goalUnit: enrolled ? unitForActivity(row.activity_type) : null,
        progress: enrolled ? Math.round(total * 100) / 100 : 0,
        day,
        status,
        telegram: row.telegram_state === 'active',
        strava: row.strava_status === 'connected',
        installed: !!row.pwa_installed,
        banned: !!row.banned_at,
        lastSeen: lastSeenById[row.user_id] || null,
        sessionSeconds: sessionById[row.user_id] || 0
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

    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [activities, telegram, strava, adminRow, summary, activityDaysRow, posts, cheersGiven, cheersReceived, notifTotal, notifUnread, lastReq, req30, sessionAgg, auditRows] = await Promise.all([
      enrollment
        ? db('challenge_activities').where({ enrollment_id: enrollment.id }).orderBy('date', 'desc').limit(50)
        : [],
      db('telegram_connections').where({ user_id: user.id }).first(),
      db('strava_connections').where({ user_id: user.id }).first(),
      db('admins').where({ user_id: user.id }).first(),
      enrollment ? enrollmentSummary(enrollment.id) : null,
      enrollment
        ? db('challenge_activities').where({ enrollment_id: enrollment.id }).countDistinct({ c: 'date' }).first()
        : null,
      db('community_posts').where({ user_id: user.id }).count({ c: '*' }).first(),
      db('post_cheers').where({ user_id: user.id }).count({ c: '*' }).first(),
      db('post_cheers')
        .join('community_posts', 'community_posts.id', 'post_cheers.post_id')
        .where('community_posts.user_id', user.id)
        .count({ c: '*' })
        .first(),
      db('notifications').where({ user_id: user.id }).count({ c: '*' }).first(),
      db('notifications').where({ user_id: user.id }).whereNull('read_at').count({ c: '*' }).first(),
      db('request_logs').where({ user_id: user.id }).orderBy('created_at', 'desc').first(),
      db('request_logs').where({ user_id: user.id }).where('created_at', '>=', monthAgo).count({ c: '*' }).first(),
      db('session_logs').where({ user_id: user.id }).sum({ s: 'duration_seconds' }).count({ n: '*' }).first(),
      db('admin_audit_log')
        .leftJoin('users', 'users.id', 'admin_audit_log.admin_user_id')
        .where({ 'admin_audit_log.target_type': 'user', 'admin_audit_log.target_id': user.id })
        .select('admin_audit_log.action', 'admin_audit_log.created_at as ts', 'users.name as admin_name')
        .orderBy('admin_audit_log.created_at', 'desc')
        .limit(50)
    ]);

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
        onboardingComplete: !!user.onboarding_complete,
        banned: !!user.banned_at,
        isAdmin: !!adminRow,
        pwaInstalled: !!user.pwa_installed,
        installedAt: user.installed_at,
        notes: user.notes || null
      },
      enrollment: summary
        ? {
            goalValue: summary.enrollment.goalValue,
            goalUnit: summary.enrollment.goalUnit,
            activityType: summary.enrollment.activityType,
            status: summary.enrollment.status,
            startDate: summary.enrollment.startDate,
            endDate: summary.enrollment.endDate,
            day: summary.enrollment.day,
            totalValue: summary.totalValue,
            percent: summary.percent,
            thisWeekValue: summary.thisWeekValue,
            thisWeekActivities: summary.thisWeekActivities,
            nextMilestone: summary.nextMilestone,
            milestones: summary.milestones,
            statusReason: summary.status,
            activityDays: Number(activityDaysRow.c)
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
        telegram: telegram
          ? { state: telegram.state, telegramUserId: telegram.telegram_user_id, linkedAt: telegram.connected_at }
          : { state: 'not_connected' },
        strava: strava
          ? {
              status: strava.status,
              athleteId: strava.strava_athlete_id,
              scope: strava.scope,
              connectedAt: strava.connected_at,
              disconnectedAt: strava.disconnected_at,
              lastSyncedAt: strava.last_synced_at
            }
          : { status: 'not_connected' }
      },
      engagement: {
        lastSeen: lastReq ? lastReq.created_at : null,
        requests30d: Number(req30.c),
        sessionSeconds: Number(sessionAgg.s) || 0,
        sessionCount: Number(sessionAgg.n) || 0
      },
      community: {
        posts: Number(posts.c),
        cheersGiven: Number(cheersGiven.c),
        cheersReceived: Number(cheersReceived.c)
      },
      notifications: {
        total: Number(notifTotal.c),
        unread: Number(notifUnread.c)
      },
      adminHistory: auditRows
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
    if (req.body.activity_type !== undefined && req.body.activity_type) updates.activity_type = String(req.body.activity_type).slice(0, 30);
    if (req.body.location !== undefined) updates.location = req.body.location ? String(req.body.location).slice(0, 120) : null;
    if (req.body.age !== undefined) updates.age = req.body.age === null ? null : Math.max(0, Math.min(120, Number(req.body.age) || 0));
    if (req.body.notes !== undefined) updates.notes = req.body.notes ? String(req.body.notes).slice(0, 2000) : null;
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

// Send a nudge to a single member (in-app + Telegram DM if linked).
router.post(
  '/members/:id/nudge',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const message = (req.body && req.body.message ? String(req.body.message).trim() : '') ||
      'Your 100 is waiting — check in today!';
    await createNotification({
      userId: user.id,
      type: 'nudge',
      title: 'A nudge from the team',
      body: message,
      force: true
    });
    telegramMessenger.sendToUser(user.id, `A nudge from the team\n\n${message}`);
    audit(req.user.id, 'member_nudge', 'user', user.id, req.ip);
    res.json({ message: 'Nudge sent' });
  })
);

// Start an impersonation session (admin views the app "as" this member).
router.post(
  '/members/:id/impersonate',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    if (user.banned_at) return res.status(409).json({ error: 'Member is banned' });
    const token = signImpersonationToken(req.user.id, user.id);
    audit(req.user.id, 'impersonate_start', 'user', user.id, req.ip);
    res.json({ token, member: { id: user.id, name: user.name } });
  })
);

// Send a free-form message to a member (Telegram DM when linked, else in-app).
router.post(
  '/members/:id/message',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const text = req.body && req.body.message ? String(req.body.message).trim().slice(0, 2000) : '';
    if (!text) return res.status(400).json({ error: 'Message is required' });

    const conn = await db('telegram_connections').where({ user_id: user.id, state: 'active' }).first();
    if (conn && conn.telegram_user_id) {
      telegramMessenger.sendToUser(user.id, text);
      await createNotification({ userId: user.id, type: 'announcement', title: 'A message from the team', body: text, force: true });
    } else {
      await createNotification({ userId: user.id, type: 'announcement', title: 'A message from the team', body: text, force: true });
    }
    audit(req.user.id, 'member_message', 'user', user.id, req.ip);
    res.json({ message: 'Message sent', delivered: !!(conn && conn.telegram_user_id) });
  })
);

// Generate a password reset link (delivered via the member's Telegram DM; the
// link is returned to the admin when the member has no Telegram connection).
router.post(
  '/members/:id/reset-password',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    passwordReset.pruneExpired().catch(() => {});
    const token = await passwordReset.createResetToken(user.id);
    const url = `${config.clientOrigin}/reset-password?token=${token}`;
    const conn = await db('telegram_connections').where({ user_id: user.id, state: 'active' }).first();
    if (conn && conn.telegram_user_id) {
      const lang = await telegramMessenger.getUserLanguage(user.id);
      telegramMessenger.sendToUser(user.id, botMessages.resetLink(lang, url));
      audit(req.user.id, 'member_reset_password', 'user', user.id, req.ip);
      res.json({ message: 'Reset link sent to their Telegram.' });
    } else {
      audit(req.user.id, 'member_reset_password', 'user', user.id, req.ip);
      res.json({ message: 'Reset link generated (no Telegram connected).', resetLink: url });
    }
  })
);

// Adjust a member's enrollment: goal_value / activity_type / status lifecycle.
router.post(
  '/members/:id/enrollment',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const challenge = await getActiveChallenge();
    const enrollment = challenge
      ? await db('enrollments').where({ user_id: user.id, challenge_id: challenge.id }).first()
      : null;
    if (!enrollment) return res.status(404).json({ error: 'Member has no enrollment' });

    const updates = {};
    if (req.body.goal_value != null) updates.goal_value = Math.max(1, Math.min(10000, Number(req.body.goal_value) || 0));
    if (req.body.activity_type !== undefined && req.body.activity_type) updates.activity_type = String(req.body.activity_type).slice(0, 30);
    if (req.body.status === 'completed') updates.status = 'completed';
    if (req.body.status === 'active' || req.body.status === 'committed') updates.status = req.body.status;
    if (Object.keys(updates).length) {
      await db('enrollments').where({ id: enrollment.id }).update(updates);
    }
    audit(req.user.id, 'member_enrollment_edit', 'user', user.id, req.ip);
    res.json({ message: 'Enrollment updated' });
  })
);

// Admin-initiated disconnect of an integration (strava | telegram).
router.post(
  '/members/:id/disconnect',
  asyncHandler(async (req, res) => {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'Member not found' });
    const integration = req.body && req.body.integration;
    if (integration === 'strava') {
      const conn = await db('strava_connections').where({ user_id: user.id }).first();
      if (conn && conn.status === 'connected') {
        try {
          const { decrypt } = require('../lib/crypto');
          const token = conn.encrypted_access_token ? decrypt(conn.encrypted_access_token) : null;
          if (token) await require('../services/strava').deauthorize(token).catch(() => {});
        } catch {}
      }
      await db('strava_connections').where({ user_id: user.id }).update({
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        token_expires_at: null,
        strava_athlete_id: null,
        scope: null,
        status: 'disconnected',
        disconnected_at: db.fn.now(),
        last_synced_at: null,
        updated_at: db.fn.now()
      });
      await db('challenge_activities')
        .where({ source: 'strava' })
        .whereIn('enrollment_id', db('enrollments').where({ user_id: user.id }).select('id'))
        .del();
      audit(req.user.id, 'disconnect_strava', 'user', user.id, req.ip);
      res.json({ message: 'Strava disconnected' });
    } else if (integration === 'telegram') {
      await db('telegram_connections').where({ user_id: user.id }).update({
        state: 'not_connected',
        telegram_user_id: null,
        link_token_hash: null,
        link_expires_at: null,
        updated_at: db.fn.now()
      });
      audit(req.user.id, 'disconnect_telegram', 'user', user.id, req.ip);
      res.json({ message: 'Telegram disconnected' });
    } else {
      return res.status(400).json({ error: "integration must be 'strava' or 'telegram'" });
    }
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

    const [dau, wau, mau, totalUsers, onboarded, newUsers30, enrolled, activeMembers, completed, installed, stravaConnected, telegramActive, sessionAgg, activitySeries, userSeries] = await Promise.all([
      db('request_logs').where('created_at', '>=', dayAgo).countDistinct({ c: 'user_id' }).first(),
      db('request_logs').where('created_at', '>=', weekAgo).countDistinct({ c: 'user_id' }).first(),
      db('request_logs').where('created_at', '>=', monthAgo).countDistinct({ c: 'user_id' }).first(),
      db('users').count({ c: '*' }).first(),
      db('users').where({ onboarding_complete: true }).count({ c: '*' }).first(),
      db('users').where('created_at', '>=', monthAgo).count({ c: '*' }).first(),
      db('enrollments').count({ c: '*' }).first(),
      db('enrollments').whereIn('status', ['committed', 'active']).countDistinct({ c: 'user_id' }).first(),
      db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first(),
      db('users').where({ pwa_installed: true }).count({ c: '*' }).first(),
      db('strava_connections').where({ status: 'connected' }).count({ c: '*' }).first(),
      db('telegram_connections').where({ state: 'active' }).count({ c: '*' }).first(),
      db('session_logs').sum({ s: 'duration_seconds' }).countDistinct({ n: 'user_id' }).first(),
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

    // Weekly retention cohorts (last 6 weeks). Computed in JS from a bounded set.
    const cohortSince = new Date(now - 6 * 7 * 24 * 3600 * 1000);
    const cohortUsers = await db('users').where('created_at', '>=', cohortSince).select('id', 'created_at');
    const cohortIds = cohortUsers.map((u) => u.id);
    const activeWeeks = cohortIds.length
      ? await db('request_logs')
          .whereIn('user_id', cohortIds)
          .where('created_at', '>=', cohortSince)
          .distinct('user_id')
          .select('user_id')
          .select(db.raw('YEARWEEK(created_at) as wk'))
      : [];
    const weekLabel = (d) => {
      const dt = new Date(d);
      const y = dt.getFullYear();
      const oneJan = new Date(y, 0, 1);
      const wk = Math.ceil(((dt - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
      return `${y}-${String(wk).padStart(2, '0')}`;
    };
    const activeByUser = new Set();
    for (const r of activeWeeks) activeByUser.add(`${r.user_id}:${r.wk}`);
    const cohortMap = {};
    for (const u of cohortUsers) {
      const wk = weekLabel(u.created_at);
      (cohortMap[wk] = cohortMap[wk] || []).push(u.id);
    }
    const allCohortWeeks = Object.keys(cohortMap).sort();
    const cohortWeeks = allCohortWeeks.slice(0, 6);
    const cohorts = cohortWeeks.map((wk) => {
      const members = cohortMap[wk];
      const row = { week: wk, size: members.length, retention: [] };
      let idx = 0;
      for (const cw of cohortWeeks.slice(cohortWeeks.indexOf(wk))) {
        const count = members.filter((uid) => activeByUser.has(`${uid}:${cw}`)).length;
        row.retention.push({ week: cw, count, pct: members.length ? Math.round((count / members.length) * 100) : 0 });
        idx += 1;
      }
      return row;
    });

    const dauN = Number(dau.c);
    const mauN = Number(mau.c);

    res.json({
      dau: dauN,
      wau: Number(wau.c),
      mau: mauN,
      stickiness: mauN > 0 ? Math.round((dauN / mauN) * 100) / 100 : 0,
      totalUsers: Number(totalUsers.c),
      onboarded: Number(onboarded.c),
      newUsers30d: Number(newUsers30.c),
      enrolled: Number(enrolled.c),
      activeMembers: Number(activeMembers.c),
      completed: Number(completed.c),
      installed: Number(installed.c),
      connections: {
        strava: Number(stravaConnected.c),
        telegram: Number(telegramActive.c),
        installed: Number(installed.c)
      },
      sessionSeconds: Number(sessionAgg.s) || 0,
      sessionUsers: Number(sessionAgg.n) || 0,
      funnel: {
        registered: Number(totalUsers.c),
        installed: Number(installed.c),
        onboarded: Number(onboarded.c),
        enrolled: Number(enrolled.c),
        active: Number(activeMembers.c),
        completed: Number(completed.c)
      },
      cohorts,
      activitySeries: activitySeries.map((r) => ({ day: r.d, count: Number(r.c), km: Math.round(Number(r.km || 0) * 100) / 100 })),
      userSeries: userSeries.map((r) => ({ day: r.d, count: Number(r.c) }))
    });
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const { page, limit } = pageParams(req.query);
    const q = db('admin_audit_log')
      .join('users', 'users.id', 'admin_audit_log.admin_user_id')
      .select(
        'admin_audit_log.id',
        'admin_audit_log.action',
        'admin_audit_log.target_type',
        'admin_audit_log.target_id',
        'admin_audit_log.ip',
        'admin_audit_log.created_at as ts',
        'users.name'
      );
    if (req.query.action) q.where('admin_audit_log.action', 'like', `%${String(req.query.action).slice(0, 60)}%`);
    dateRange(q, 'admin_audit_log.created_at', req.query);
    const totalRow = await q.clone().clearSelect().count({ c: '*' }).first();
    const rows = await q
      .orderBy('admin_audit_log.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);
    res.json({ entries: rows, total: Number(totalRow.c), page, limit });
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

// Run the scheduled-jobs cycle on demand (plus the Strava safety-net sync).
router.post(
  '/system/run-jobs',
  asyncHandler(async (req, res) => {
    const { ran } = await runScheduledJobs();
    // Strava safety-net pull on demand (guarded against concurrent runs).
    if (ran) await checkStravaSync().catch((err) => console.error('checkStravaSync failed:', err.message));
    audit(req.user.id, 'scheduler_run', 'system', 0, req.ip);
    res.json({ ran, message: ran ? 'Scheduled jobs completed' : 'Scheduler already running' });
  })
);

// One-time full Strava backfill: re-open every connected member's sync window to
// the challenge start (2026-09-23), then run the safety-net sync. Idempotent —
// imports upsert by strava_activity_id, so re-pulling never duplicates rows.
router.post(
  '/system/backfill-strava',
  asyncHandler(async (req, res) => {
    const reset = await db('strava_connections')
      .where({ status: 'connected' })
      .update({ last_synced_at: null, updated_at: db.fn.now() });
    await checkStravaSync().catch((err) => console.error('checkStravaSync failed:', err.message));
    audit(req.user.id, 'strava_backfill', 'system', 0, req.ip);
    const n = Number(reset) || 0;
    res.json({ reset: n, message: n ? `Strava backfill triggered for ${n} connection(s)` : 'No connected Strava connections to backfill' });
  })
);

// Temporary diagnostic: test TCP+TLS reachability of a target MySQL host FROM
// THIS server (e.g. cPanel -> Aiven). No credentials needed — a completed
// handshake (even an auth rejection) proves the host:port is reachable.
router.post(
  '/system/test-mysql',
  asyncHandler(async (req, res) => {
    const host = String(req.body.host || '').trim();
    const port = Number(req.body.port || 3306);
    if (!host) return res.status(400).json({ error: 'host is required' });
    let c;
    try {
      c = await mysql.createConnection({
        host,
        port,
        user: 'probe',
        password: 'probe',
        connectTimeout: 6000,
        ssl: { rejectUnauthorized: false }
      });
      await c.query('SELECT 1');
      await c.end().catch(() => {});
      return res.json({ reachable: true, host, port, detail: 'connected' });
    } catch (err) {
      if (c) await c.end().catch(() => {});
      const code = String(err.code || '');
      const networkish = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/.test(code);
      const handshake = code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_HOST_NOT_PRIVILEGED' || code === 'ER_HOST_IS_BLOCKED';
      return res.json({
        reachable: handshake,
        host,
        port,
        code,
        detail: handshake ? 'reachable (server responded — auth rejected, expected for probe creds)' : networkish ? 'unreachable (network / firewall)' : 'unknown'
      });
    }
  })
);

// Force the log prune (ignores the once-per-day guard).
router.post(
  '/system/flush-logs',
  asyncHandler(async (req, res) => {
    const { ran, removed } = await pruneLogs({ force: true });
    audit(req.user.id, 'log_flush', 'system', 0, req.ip);
    res.json({ ran, removed, message: ran ? `Pruned ${removed} log rows` : 'Logs already pruned today' });
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
    dateRange(q, 'created_at', req.query);
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
    dateRange(q, 'created_at', req.query);
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
    dateRange(q, 'created_at', req.query);
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
    deletedAt: b.deleted_at,
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
    const includeDeleted = req.query.deleted === '1';
    const { page, limit } = pageParams(req.query);
    const { rows, total } = await listBroadcasts({
      status,
      limit,
      includeDeleted,
      page,
      from: req.query.from,
      to: req.query.to
    });
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
      })),
      total,
      page,
      limit
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

router.post(
  '/broadcasts/:id/restore',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const result = await restoreBroadcast(id);
    if (!result) return res.status(404).json({ error: 'Broadcast not found or not archived' });
    audit(req.user.id, 'broadcast_restore', 'broadcast', id, req.ip);
    res.json({ message: 'Broadcast restored', broadcast: serializeBroadcastRow(result) });
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
    const q = db('contact_messages');
    if (req.query.status) q.where({ status: String(req.query.status).slice(0, 20) });
    dateRange(q, 'created_at', req.query);
    const totalRow = await q.clone().count({ c: '*' }).first();

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
      .modify((b) => {
        if (req.query.status) b.where({ 'contact_messages.status': String(req.query.status).slice(0, 20) });
        dateRange(b, 'contact_messages.created_at', req.query);
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