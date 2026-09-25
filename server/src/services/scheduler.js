const db = require('../db');
const { todayISO, diffDays, startOfWeek } = require('../lib/dates');
const { createNotification } = require('./notifications');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const telegramMessenger = require('./telegramMessenger');
const botMessages = require('./botMessages');
const { getMeta, setMeta } = require('./meta');
const { logEvent } = require('./logger');
const { publishDueScheduled } = require('./broadcast');

// Fast path for the once-per-day digest guard (persisted in the `meta` table so
// a restart can't double-send the daily digest).
let lastDigestDay = null;

async function totalsByEnrollment(enrollmentIds) {
  if (!enrollmentIds.length) return {};
  const rows = await db('challenge_activities')
    .whereIn('enrollment_id', enrollmentIds)
    .groupBy('enrollment_id')
    .select('enrollment_id')
    .sum({ total: 'quantity' });
  const out = {};
  for (const r of rows) out[r.enrollment_id] = Number(r.total) || 0;
  return out;
}

async function lastDatesByEnrollment(enrollmentIds) {
  if (!enrollmentIds.length) return {};
  const rows = await db('challenge_activities')
    .whereIn('enrollment_id', enrollmentIds)
    .groupBy('enrollment_id')
    .select('enrollment_id')
    .max({ last: 'date' });
  const out = {};
  for (const r of rows) out[r.enrollment_id] = r.last;
  return out;
}

async function recentlyNotifiedUserIds(type, withinDays, userIds) {
  if (!userIds.length) return new Set();
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const rows = await db('notifications')
    .whereIn('user_id', userIds)
    .where({ type })
    .where('created_at', '>=', since)
    .distinct('user_id');
  return new Set(rows.map((r) => r.user_id));
}

// Batch-fetch user names/languages once — avoids a query per member in loops.
async function usersById(userIds) {
  if (!userIds.length) return {};
  const rows = await db('users').whereIn('id', userIds).select('id', 'name', 'language');
  const out = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

// Enrollments of non-banned members (banned accounts are excluded from all
// scheduler messaging — a global ban stops web + Telegram).
async function activeEnrollments() {
  const banned = await db('users').whereNotNull('banned_at').pluck('id');
  const q = db('enrollments').whereIn('status', ['committed', 'active']);
  if (banned.length) q.whereNotIn('user_id', banned);
  return q;
}

async function checkFinishers() {
  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;

  const totals = await totalsByEnrollment(enrollments.map((e) => e.id));
  const finishers = enrollments.filter((e) => (totals[e.id] || 0) >= Number(e.goal_value));
  if (!finishers.length) return;

  const users = await usersById(finishers.map((e) => e.user_id));
  for (const e of finishers) {
    // Atomic conditional flip: progressEvents (on every logged activity) can
    // race this job — only the caller that changes the row announces the finish.
    const flipped = await db('enrollments')
      .where({ id: e.id })
      .whereIn('status', ['committed', 'active'])
      .update({ status: 'completed', completed_at: db.fn.now() });
    if (flipped !== 1) continue;
    const unitLabel = UNIT_LABEL[unitForActivity(e.activity_type)] || 'KM';
    await createNotification({
      userId: e.user_id,
      type: 'finish',
      title: 'YOU DID IT.',
      body: `You reached ${e.goal_value} ${unitLabel}. You finished what you started.`
    });
    const user = users[e.user_id];
    telegramMessenger.sendToUser(e.user_id, botMessages.finish((user && user.language) || 'en', e.goal_value, unitLabel));
    telegramMessenger.broadcastFinish(user ? user.name : 'Member', e.goal_value, unitLabel);
  }
}

async function checkInactivity() {
  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;

  const lastDates = await lastDatesByEnrollment(enrollments.map((e) => e.id));
  const candidates = enrollments.filter((e) => {
    const last = lastDates[e.id];
    const daysSince = last ? diffDays(last, todayISO()) : 999;
    return daysSince >= 7;
  });
  if (!candidates.length) return;

  const already = await recentlyNotifiedUserIds('inactivity', 7, candidates.map((e) => e.user_id));
  const users = await usersById(candidates.map((e) => e.user_id));
  for (const e of candidates) {
    if (already.has(e.user_id)) continue;
    // `null` when the member has never logged anything — the message renders a
    // friendly "haven't logged yet" phrase instead of a fake number.
    const daysSince = lastDates[e.id] ? diffDays(lastDates[e.id], todayISO()) : null;
    await createNotification({
      userId: e.user_id,
      type: 'inactivity',
      title: "You haven't checked in recently.",
      body: 'Your 100 is still waiting. Keep moving.'
    });
    const lang = (users[e.user_id] && users[e.user_id].language) || 'en';
    telegramMessenger.sendToUser(e.user_id, botMessages.inactivity(lang, daysSince));
  }
}

async function checkWeekly() {
  const today = todayISO();
  const weekStart = startOfWeek(today);
  if (diffDays(weekStart, today) !== 0) return; // only on first day of week (Monday)
  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;

  const totals = await totalsByEnrollment(enrollments.map((e) => e.id));
  const already = await recentlyNotifiedUserIds('weekly_checkin', 6, enrollments.map((e) => e.user_id));
  const users = await usersById(enrollments.map((e) => e.user_id));
  for (const e of enrollments) {
    if (already.has(e.user_id)) continue;
    await createNotification({
      userId: e.user_id,
      type: 'weekly_checkin',
      title: 'How did your week go?',
      body: 'Log your activities and keep your streak alive.'
    });
    const total = totals[e.id] || 0;
    const unitLabel = UNIT_LABEL[unitForActivity(e.activity_type)] || 'KM';
    const lang = (users[e.user_id] && users[e.user_id].language) || 'en';
    telegramMessenger.sendToUser(e.user_id, botMessages.weeklyCheckin(lang, total, e.goal_value, unitLabel));
  }
}

async function sendDailyDigest() {
  const today = todayISO();
  if (!lastDigestDay) {
    lastDigestDay = await getMeta('digest_day'); // survives restarts
  }
  if (lastDigestDay === today) return; // once per day

  const checkedInToday = await db('challenge_activities')
    .where({ date: today })
    .countDistinct({ c: 'enrollment_id' })
    .first();
  const weekStart = startOfWeek(today);
  const milestonesThisWeek = await db('milestones')
    .where('reached_at', '>=', `${weekStart} 00:00:00`)
    .count({ c: '*' })
    .first();
  const finishers = await db('enrollments').where({ status: 'completed' }).count({ c: '*' }).first();

  await telegramMessenger.broadcastDigest(
    Number(checkedInToday.c),
    Number(milestonesThisWeek.c),
    Number(finishers.c)
  );

  lastDigestDay = today;
  await setMeta('digest_day', today);
}

// Expire invite tokens that were generated but never completed via /start.
async function pruneStaleInvites() {
  const result = await db('telegram_connections')
    .where({ state: 'invite_generated' })
    .where('link_expires_at', '<', new Date())
    .update({
      state: 'not_connected',
      link_token_hash: null,
      link_expires_at: null,
      updated_at: db.fn.now()
    });
  if (result > 0) {
    console.log(`[scheduler] pruned ${result} expired Telegram invite(s)`);
  }
}

const JOBS = [checkFinishers, checkInactivity, checkWeekly, sendDailyDigest, pruneStaleInvites, publishDueScheduled, pruneLogs];

// Overlap guard: a slow cycle (large member base) must never interleave with
// the next interval tick — that would duplicate broadcasts/notifications.
let jobCycleRunning = false;

async function runScheduledJobs() {
  if (jobCycleRunning) return;
  jobCycleRunning = true;
  const startedAt = Date.now();
  try {
    // Each job is isolated: one failure must not abort the rest of the cycle.
    for (const job of JOBS) {
      try {
        await job();
      } catch (err) {
        console.error(`Scheduler job ${job.name} failed:`, err.message);
        logEvent({
          source: 'scheduler',
          type: 'job_error',
          message: `${job.name} failed: ${err.message}`,
          meta: { job: job.name }
        });
      }
    }
    logEvent({
      source: 'scheduler',
      type: 'run',
      message: `scheduled jobs completed in ${Date.now() - startedAt}ms`,
      meta: { durationMs: Date.now() - startedAt }
    });
  } finally {
    jobCycleRunning = false;
  }
}

// Delete old log rows and enforce a hard cap so request/error/event tables
// can't grow without bound. Runs once per day (tracked in the meta table).
async function pruneLogs() {
  const day = todayISO();
  const last = await getMeta('last_log_prune');
  if (last === day) return;
  await setMeta('last_log_prune', day);

  const reqRetention = Number(process.env.LOG_RETENTION_DAYS || 14);
  const errRetention = Number(process.env.LOG_ERROR_RETENTION_DAYS || 30);
  const reqCutoff = new Date(Date.now() - reqRetention * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const errCutoff = new Date(Date.now() - errRetention * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const delReq = await db('request_logs').where('created_at', '<', reqCutoff).del();
  const delErr = await db('error_logs').where('created_at', '<', errCutoff).del();
  const delEvt = await db('event_logs').where('created_at', '<', errCutoff).del();

  const max = Number(process.env.LOG_MAX_ROWS || 100000);
  const countRow = await db('request_logs').count({ c: '*' }).first();
  const count = Number(countRow.c) || 0;
  let delCap = 0;
  if (count > max) {
    const overflow = count - max;
    const oldest = await db('request_logs').orderBy('id', 'asc').limit(overflow).select('id');
    if (oldest.length) {
      delCap = await db('request_logs').whereIn('id', oldest.map((r) => r.id)).del();
    }
  }

  const removed = delReq + delErr + delEvt + delCap;
  if (removed > 0) {
    console.log(`[logs] pruned ${removed} log row(s) (requests ${delReq}, errors ${delErr}, events ${delEvt}, cap ${delCap})`);
  }
}

function startScheduler() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const ONE_MINUTE = 60 * 1000;
  setTimeout(runScheduledJobs, 10 * 1000);
  setInterval(runScheduledJobs, SIX_HOURS);
  // Scheduled broadcasts must go live promptly — poll every minute.
  setInterval(() => {
    publishDueScheduled().catch((err) => console.error('publishDueScheduled failed:', err.message));
  }, ONE_MINUTE);
}

module.exports = { runScheduledJobs, startScheduler };