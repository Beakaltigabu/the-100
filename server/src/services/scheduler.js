const db = require('../db');
const { todayISO, diffDays, startOfWeek } = require('../lib/dates');
const { createNotification, telegramAllowed } = require('./notifications');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const telegramMessenger = require('./telegramMessenger');
const { getMeta, setMeta } = require('./meta');
const { logEvent } = require('./logger');
const { publishDueScheduled } = require('./broadcast');
const { syncStrava } = require('./stravaSync');
const { syncMilestones } = require('./milestones');
const botSettings = require('./botSettings');
const botGroupGuard = require('./botGroupGuard');
const botMessagesV2 = require('./botMessagesV2');
const { getActiveChallenge } = require('./challengeWindow');
const { dbHealthy } = require('./dbHealth');
const { alertAdmins, sendAdminMessage } = require('./adminAlerts');
const { backlog } = require('./queue');

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
    // Award milestone rows first (idempotent — only fills unreached thresholds)
    // so a completed enrollment never leaves milestones un-marked.
    try {
      await syncMilestones(e.id, totals[e.id] || 0);
    } catch (err) {
      console.error('checkFinishers milestone sync error:', err.message);
    }
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
    if (await telegramAllowed(e.user_id, 'finish')) {
      telegramMessenger.sendToUser(e.user_id, botMessagesV2.completion({ goal: Number(e.goal_value), unit: unitLabel }), {
        inline_keyboard: [
          [{ text: 'WHAT\u2019S NEXT?', callback_data: 'whats_next' }]
        ]
      });
    }
    if (await botGroupGuard.isGroupLive()) {
      await botGroupGuard.sendToCommunity(
        botMessagesV2.groupMemberFinish({ name: user ? user.name : 'Member', goal: Number(e.goal_value), unit: unitLabel })
      );
    }
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
  for (const e of candidates) {
    if (already.has(e.user_id)) continue;
    const settings = await botSettings.getSettings(e.user_id);
    if (settings.remindersMode === 'never') continue;
    await createNotification({
      userId: e.user_id,
      type: 'inactivity',
      title: "You haven't checked in recently.",
      body: 'Your 100 is still waiting. Keep moving.'
    });
    if (await telegramAllowed(e.user_id, 'inactivity')) {
      telegramMessenger.sendToUser(e.user_id, botMessagesV2.reengage(), {
        inline_keyboard: [[{ text: '📝 LOG ACTIVITY', callback_data: 'log' }]]
      });
    }
  }
}

// Weekly PERSONAL recap (replaces the old generic weekly check-in). English,
// gated by the user's bot settings. Runs Mondays.
async function checkWeekly() {
  const today = todayISO();
  const weekStart = startOfWeek(today);
  if (diffDays(weekStart, today) !== 0) return; // only on first day of week (Monday)
  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;

  const totals = await totalsByEnrollment(enrollments.map((e) => e.id));
  const last = await lastDatesByEnrollment(enrollments.map((e) => e.id));
  const already = await recentlyNotifiedUserIds('weekly_checkin', 6, enrollments.map((e) => e.user_id));
  const challenge = await getActiveChallenge();
  const week = challenge ? Math.floor(diffDays(challenge.start_date, today) / 7) + 1 : 0;

  for (const e of enrollments) {
    if (already.has(e.user_id)) continue;
    const settings = await botSettings.getSettings(e.user_id);
    if (!settings.weeklyOn) continue;

    const unitLabel = UNIT_LABEL[unitForActivity(e.activity_type)] || 'KM';
    const goal = Number(e.goal_value);
    const total = totals[e.id] || 0;
    const pct = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;
    const next = await db('milestones').where({ enrollment_id: e.id }).whereNull('reached_at').orderBy('threshold', 'asc').first();

    // This week's activity: sum from weekStart and count distinct days.
    const weekRows = await db('challenge_activities')
      .where({ enrollment_id: e.id })
      .where('date', '>=', weekStart)
      .groupBy('date')
      .select('date')
      .sum({ total: 'quantity' });
    const weekKm = Math.round((Number(weekRows.reduce((a, r) => a + Number(r.total || 0), 0)) || 0) * 100) / 100;
    const days = new Set(weekRows.map((r) => r.date)).size;

    await createNotification({
      userId: e.user_id,
      type: 'weekly_checkin',
      title: 'Your week in THE 100',
      body: 'A quick look back at your week.'
    });
    telegramMessenger.sendToUser(
      e.user_id,
      botMessagesV2.weeklyRecap({
        week,
        weekKm,
        unit: unitLabel,
        activities: days,
        total: Math.round(total * 100) / 100,
        goal,
        pct,
        next: next ? Number(next.threshold) : null,
        remainingToNext: next ? Math.round((Math.max(0, Number(next.threshold) - total)) * 100) / 100 : 0
      })
    );
  }
}

// Group catalyst: a weekly conversation starter, rate-limited by the botGroupGuard.
async function checkGroupCatalyst() {
  const week = botGroupGuard.currentWeek();
  const last = await getMeta('bot_group_starter_week');
  if (last === week) return;
  const ok = await botGroupGuard.canPostToGroup();
  if (!ok) return;
  const sent = await botGroupGuard.sendToCommunity(botMessagesV2.groupConversationStarter(Number(week.split('-W')[1]) || 0));
  if (sent.sent) await setMeta('bot_group_starter_week', week);
}

// Challenge-day moments (private). Only meaningful days: 1,10,25,50,75,90,99,100.
// Never sent to members who already completed; gated by milestone settings.
const CHALLENGE_DAYS = [1, 10, 25, 50, 75, 90, 99, 100];

async function checkChallengeDays() {
  const challenge = await getActiveChallenge();
  if (!challenge) return;
  const today = todayISO();
  const day = diffDays(challenge.start_date, today) + 1;
  if (day < 1 || day > 100) return;
  if (!CHALLENGE_DAYS.includes(day)) return;
  const metaKey = `bot_day_${challenge.id}_${day}`;
  if ((await getMeta(metaKey)) === '1') return; // once per day, survives restarts

  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;
  const text = botMessagesV2.challengeDay(day);
  for (const e of enrollments) {
    if (e.status === 'completed') continue;
    const settings = await botSettings.getSettings(e.user_id);
    if (!settings.milestonesOn) continue;
    telegramMessenger.sendToUser(e.user_id, text);
  }
  await setMeta(metaKey, '1');
}

// Community-wide challenge moments (group post) on the curated days — only
// while the challenge is active, once per day, guard-capped.
const GROUP_DAYS = [1, 10, 50, 75, 90, 99, 100];

async function checkGroupChallengeMoments() {
  const challenge = await getActiveChallenge();
  if (!challenge) return;
  const today = todayISO();
  const day = diffDays(challenge.start_date, today) + 1;
  if (day < 1 || day > 100) return;
  if (!GROUP_DAYS.includes(day)) return;
  const metaKey = `bot_group_day_${challenge.id}_${day}`;
  if ((await getMeta(metaKey)) === '1') return;
  const text = botMessagesV2.groupChallengeMoment(day);
  if (!text) return;
  const sent = await botGroupGuard.sendToCommunity(text);
  if (sent.sent) await setMeta(metaKey, '1');
}

// Collective-distance thresholds: one post each time the community total
// crosses a meaningful milestone. Guard-capped (a threshold won't always win
// the weekly budget).
const COLLECTIVE_THRESHOLDS = [100, 500, 1000, 2500, 5000, 10000];

async function checkCollectiveDistance() {
  const challenge = await getActiveChallenge();
  if (!challenge) return;
  const enrollments = await activeEnrollments();
  if (!enrollments.length) return;
  const ids = enrollments.map((e) => e.id);
  const r = await db('challenge_activities').whereIn('enrollment_id', ids).sum({ s: 'quantity' }).first();
  const total = Number(r.s) || 0;
  let next = null;
  for (const t of COLLECTIVE_THRESHOLDS) {
    if (total >= t && (Number(await getMeta(`bot_collective_${t}`)) || 0) === 0) {
      next = t;
      break;
    }
  }
  if (!next) return;
  const people = await db('challenge_activities').whereIn('enrollment_id', ids).countDistinct({ c: 'enrollment_id' }).first();
  const sent = await botGroupGuard.sendToCommunity(botMessagesV2.groupCollectiveDistance({ km: next, people: Number(people.c) || 0 }));
  if (sent.sent) await setMeta(`bot_collective_${next}`, '1');
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

const JOBS = [checkFinishers, checkInactivity, checkWeekly, checkGroupCatalyst, checkChallengeDays, checkGroupChallengeMoments, checkCollectiveDistance, sendAdminDigest, pruneStaleInvites, publishDueScheduled, pruneLogs];

// Daily admin digest via the bot: a short morning summary of the system.
// Runs once per day (meta-gated); skips while the DB is saturated.
async function sendAdminDigest() {
  const day = todayISO();
  const last = await getMeta('admin_digest_day');
  if (last === day) return { ran: false, reason: 'already-sent' };
  if (!dbHealthy()) return { ran: false, reason: 'db-saturated' };
  await setMeta('admin_digest_day', day);

  const ch = await getActiveChallenge();
  const lines = ['📊 THE 100 · DAILY DIGEST', ''];
  if (ch) {
    const dayNum = Math.min(100, Math.max(1, diffDays(ch.start_date, day) + 1));
    lines.push(`DAY ${dayNum} / 100`);
  }

  if (ch) {
    const members = await db('enrollments')
      .where({ challenge_id: ch.id })
      .whereIn('status', ['committed', 'active'])
      .countDistinct({ c: 'user_id' })
      .first();
    const weekStart = startOfWeek(day);
    const activeWeek = await db('challenge_activities')
      .where('date', '>=', weekStart)
      .countDistinct({ c: 'enrollment_id' })
      .first();
    const dist = await db('challenge_activities').sum({ s: 'quantity' }).first();
    lines.push('', `MEMBERS  ${Number(members.c) || 0} total · ${Number(activeWeek.c) || 0} active this week`);
    lines.push(`DISTANCE ${Math.round(Number(dist.s) || 0)} KM moved`);
  }

  const stravaConnected = await db('strava_connections').where({ status: 'connected' }).count({ c: '*' }).first();
  const stravaDisconnected = await db('strava_connections').where({ status: 'disconnected' }).count({ c: '*' }).first();
  const err24 = await db('error_logs').where('created_at', '>=', new Date(Date.now() - 86400000)).count({ c: '*' }).first();
  lines.push(
    '',
    `STRAVA  ${Number(stravaConnected.c) || 0} connected · ${Number(stravaDisconnected.c) || 0} disconnected`,
    `HEALTH  DB ${dbHealthy() ? 'ok' : 'backing off'} · errors(24h) ${Number(err24.c) || 0} · queue ${backlog()}`
  );

  await sendAdminMessage(lines.join('\n'));
  return { ran: true };
}

// Safety-net Strava sync: the webhook is the primary path for new activities,
// but a low-frequency poll catches anything the webhook missed. Runs every 4h.
let stravaSyncRunning = false;

async function checkStravaSync() {
  if (stravaSyncRunning) return;
  stravaSyncRunning = true;
  try {
    const banned = await db('users').whereNotNull('banned_at').pluck('id');
    const q = db('strava_connections')
      .join('enrollments', 'enrollments.user_id', 'strava_connections.user_id')
      .join('challenges', 'challenges.id', 'enrollments.challenge_id')
      .where({ 'strava_connections.status': 'connected', 'challenges.is_active': true })
      .distinct('strava_connections.user_id as user_id');
    if (banned.length) q.whereNotIn('strava_connections.user_id', banned);
    const rows = await q;

    let imported = 0;
    let rateLimited = false;
    for (const r of rows) {
      // Per-user guard: one bad connection (e.g. unreadable/expired token) must
      // not abort the whole run — log it and continue to the next member.
      try {
        const res = await syncStrava(r.user_id);
        imported += res.imported || 0;
        // Back off the rest of the run when Strava is throttling us.
        if (res.rateLimited) {
          rateLimited = true;
          break;
        }
      } catch (err) {
        logEvent({
          source: 'strava',
          type: 'sync_error',
          message: `Strava sync failed for user ${r.user_id}: ${err.message}`,
          meta: { userId: String(r.user_id) }
        });
        console.error(`[scheduler] Strava sync error for user ${r.user_id}:`, err.message);
        alertAdmins(`Strava sync failed for user ${r.user_id}: ${err.message}`, { category: 'strava' }).catch(() => {});
      }
    }
    if (imported > 0 || rateLimited) {
      console.log(`[scheduler] Strava safety-net sync: imported ${imported} activity(s), rateLimited=${rateLimited}`);
    }
  } finally {
    stravaSyncRunning = false;
  }
}

// Overlap guard: a slow cycle (large member base) must never interleave with
// the next interval tick — that would duplicate broadcasts/notifications.
let jobCycleRunning = false;

async function runScheduledJobs() {
  if (jobCycleRunning) return { ran: false };
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
        alertAdmins(`Scheduler job ${job.name} failed: ${err.message}`, { category: 'scheduler' }).catch(() => {});
      }
    }
    logEvent({
      source: 'scheduler',
      type: 'run',
      message: `scheduled jobs completed in ${Date.now() - startedAt}ms`,
      meta: { durationMs: Date.now() - startedAt }
    });
    return { ran: true, durationMs: Date.now() - startedAt };
  } finally {
    jobCycleRunning = false;
  }
}

// Delete old log rows and enforce a hard cap so request/error/event tables
// can't grow without bound. Runs once per day (tracked in the meta table).
async function pruneLogs({ force = false } = {}) {
  const day = todayISO();
  const last = await getMeta('last_log_prune');
  if (!force && last === day) return { ran: false, removed: 0 };
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
  return { ran: true, removed };
}

function startScheduler() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  const ONE_MINUTE = 60 * 1000;
  setTimeout(runScheduledJobs, 10 * 1000);
  setInterval(runScheduledJobs, SIX_HOURS);
  // Strava safety-net sync every 4 hours (webhook remains the primary path).
  setTimeout(() => {
    checkStravaSync().catch((err) => console.error('checkStravaSync failed:', err.message));
  }, 15 * 1000);
  setInterval(() => {
    checkStravaSync().catch((err) => console.error('checkStravaSync failed:', err.message));
  }, FOUR_HOURS);
  // Scheduled broadcasts must go live promptly — poll every minute (skip while
  // MySQL is saturated to avoid piling more load onto a full server).
  setInterval(() => {
    if (!dbHealthy()) return;
    publishDueScheduled().catch((err) => console.error('publishDueScheduled failed:', err.message));
  }, ONE_MINUTE);
}

module.exports = { runScheduledJobs, checkStravaSync, pruneLogs, checkInactivity, checkWeekly, checkGroupCatalyst, checkChallengeDays, checkGroupChallengeMoments, checkCollectiveDistance, sendAdminDigest, startScheduler };