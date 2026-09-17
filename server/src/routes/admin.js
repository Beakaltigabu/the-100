const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { dayNumber, enrollmentStatus } = require('../services/progress');
const { unitForActivity } = require('../constants');
const { todayISO } = require('../lib/dates');
const { audit } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const members = await db('users').count({ c: '*' }).first();
    const active = await db('enrollments')
      .whereIn('status', ['committed', 'active'])
      .countDistinct({ c: 'user_id' })
      .first();
    const telegramConnected = await db('telegram_connections').where({ state: 'active' }).count({ c: '*' }).first();
    const stravaConnected = await db('strava_connections').where({ status: 'connected' }).count({ c: '*' }).first();
    const completed = await db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first();
    const totalValue = await db('challenge_activities').sum({ s: 'quantity' }).first();

    res.json({
      stats: {
        members: Number(members.c),
        active: Number(active.c),
        telegramConnected: Number(telegramConnected.c),
        stravaConnected: Number(stravaConnected.c),
        completed: Number(completed.c),
        totalValue: Math.round(Number(totalValue.s) * 100) / 100 || 0
      }
    });
  })
);

router.get(
  '/members',
  asyncHandler(async (req, res) => {
    const challenge = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
    const rows = await db('enrollments')
      .join('users', 'users.id', 'enrollments.user_id')
      .leftJoin('telegram_connections', 'telegram_connections.user_id', 'enrollments.user_id')
      .leftJoin('strava_connections', 'strava_connections.user_id', 'enrollments.user_id')
      .where({ 'enrollments.challenge_id': challenge ? challenge.id : 0 })
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
      .orderBy('enrollments.created_at', 'desc');

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

    res.json({ members });
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
    const challenge = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
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

module.exports = router;