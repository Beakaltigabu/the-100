const db = require('../db');
const { todayISO, diffDays, startOfWeek } = require('../lib/dates');
const { createNotification } = require('./notifications');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const telegramMessenger = require('./telegramMessenger');
const botMessages = require('./botMessages');

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

async function checkFinishers() {
  const enrollments = await db('enrollments').whereIn('status', ['committed', 'active']);
  if (!enrollments.length) return;

  const totals = await totalsByEnrollment(enrollments.map((e) => e.id));
  for (const e of enrollments) {
    const total = totals[e.id] || 0;
    if (total >= Number(e.goal_value)) {
      await db('enrollments').where({ id: e.id }).update({ status: 'completed', completed_at: db.fn.now() });
      const unitLabel = UNIT_LABEL[unitForActivity(e.activity_type)] || 'KM';
      await createNotification({
        userId: e.user_id,
        type: 'finish',
        title: 'YOU DID IT.',
        body: `You reached ${e.goal_value} ${unitLabel}. You finished what you started.`
      });
      const user = await db('users').where({ id: e.user_id }).first();
      const lang = await telegramMessenger.getUserLanguage(e.user_id);
      telegramMessenger.sendToUser(e.user_id, botMessages.finish(lang, e.goal_value, unitLabel));
      telegramMessenger.broadcastFinish(user ? user.name : 'Member', e.goal_value, unitLabel);
    }
  }
}

async function checkInactivity() {
  const enrollments = await db('enrollments').whereIn('status', ['committed', 'active']);
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
    const daysSince = lastDates[e.id] ? diffDays(lastDates[e.id], todayISO()) : 999;
    await createNotification({
      userId: e.user_id,
      type: 'inactivity',
      title: "You haven't checked in recently.",
      body: 'Your 100 is still waiting. Keep moving.'
    });
    const lang = await telegramMessenger.getUserLanguage(e.user_id);
    telegramMessenger.sendToUser(e.user_id, botMessages.inactivity(lang, daysSince));
  }
}

async function checkWeekly() {
  const today = todayISO();
  const weekStart = startOfWeek(today);
  if (diffDays(weekStart, today) !== 0) return; // only on first day of week (Monday)
  const enrollments = await db('enrollments').whereIn('status', ['committed', 'active']);
  if (!enrollments.length) return;

  const totals = await totalsByEnrollment(enrollments.map((e) => e.id));
  const already = await recentlyNotifiedUserIds('weekly_checkin', 6, enrollments.map((e) => e.user_id));
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
    const lang = await telegramMessenger.getUserLanguage(e.user_id);
    telegramMessenger.sendToUser(e.user_id, botMessages.weeklyCheckin(lang, total, e.goal_value, unitLabel));
  }
}

async function sendDailyDigest() {
  const today = todayISO();
  if (lastDigestDay === today) return; // once per day
  lastDigestDay = today;

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
}

async function runScheduledJobs() {
  try {
    await checkFinishers();
    await checkInactivity();
    await checkWeekly();
    await sendDailyDigest();
  } catch (err) {
    console.error('Scheduler error:', err.message);
  }
}

function startScheduler() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setTimeout(runScheduledJobs, 10 * 1000);
  setInterval(runScheduledJobs, SIX_HOURS);
}

module.exports = { runScheduledJobs, startScheduler };