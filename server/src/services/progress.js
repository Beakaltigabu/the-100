const db = require('../db');
const { milestonesForActivity, unitForActivity, TOTAL_DAYS, ON_TRACK_TOLERANCE } = require('../constants');
const { diffDays, startOfWeek, todayISO } = require('../lib/dates');
const { getActiveChallenge } = require('./challengeWindow');

function dayNumber(startDate, today) {
  const diff = diffDays(startDate, today);
  return Math.min(TOTAL_DAYS, Math.max(1, diff + 1));
}

function totalForEnrollment(enrollmentId) {
  return db('challenge_activities')
    .where({ enrollment_id: enrollmentId })
    .sum({ total: 'quantity' })
    .first()
    .then((row) => Number(row.total) || 0);
}

function activitiesBetween(enrollmentId, fromISO, toISO) {
  return db('challenge_activities')
    .where({ enrollment_id: enrollmentId })
    .whereBetween('date', [fromISO, toISO])
    .orderBy('date', 'desc');
}

async function thisWeekForEnrollment(enrollmentId, today) {
  const start = startOfWeek(today);
  const rows = await activitiesBetween(enrollmentId, start, today);
  const value = rows.reduce((acc, r) => acc + Number(r.quantity), 0);
  return { value, activities: rows.length };
}

function nextMilestone(total, thresholds) {
  const next = thresholds.find((t) => total < t);
  if (!next) return null;
  return { threshold: next, remaining: Math.max(0, next - total) };
}

function reachedThresholds(total, thresholds) {
  return thresholds.filter((t) => total >= t);
}

function enrollmentStatus(enrollment, total, lastActivityDate) {
  if (enrollment.status === 'completed') return 'completed';

  const today = todayISO();
  const day = dayNumber(enrollment.start_date, today);

  // Before the challenge starts, members are simply "not started" — never
  // falling behind.
  if (today < enrollment.start_date) return 'not_started';

  // Just started: the first couple of days are always "on track", so a brand
  // new member isn't immediately flagged as falling behind.
  if (day <= 2) return 'on_track';

  const expected = Number(enrollment.goal_value) * (day / TOTAL_DAYS) * ON_TRACK_TOLERANCE;
  if (total >= expected) return 'on_track';

  if (!lastActivityDate) return 'inactive';
  const daysSince = diffDays(lastActivityDate, today);
  return daysSince > 7 ? 'inactive' : 'falling_behind';
}

async function enrollmentSummary(enrollmentId) {
  const enrollment = await db('enrollments').where({ id: enrollmentId }).first();
  if (!enrollment) return null;

  // The active challenge is the authoritative source for the window, so the
  // countdown and day counter are correct for every member (incl. existing
  // enrollments created before the challenge dates were set).
  const challenge = await getActiveChallenge();
  const startDate = (challenge && challenge.start_date) || enrollment.start_date;
  const endDate = (challenge && challenge.end_date) || enrollment.end_date;

  const today = todayISO();
  const total = await totalForEnrollment(enrollmentId);
  const week = await thisWeekForEnrollment(enrollmentId, today);
  const last = await db('challenge_activities')
    .where({ enrollment_id: enrollmentId })
    .orderBy('date', 'desc')
    .first();

  const day = dayNumber(startDate, today);
  const goal = Number(enrollment.goal_value);
  const percent = goal > 0 ? (total / goal) * 100 : 0;
  const thresholds = milestonesForActivity(enrollment.activity_type);
  const daysUntilStart = Math.max(0, diffDays(today, startDate));

  const milestones = await db('milestones')
    .where({ enrollment_id: enrollmentId })
    .orderBy('threshold', 'asc');

  return {
    enrollment: {
      id: enrollment.id,
      goalValue: goal,
      goalUnit: unitForActivity(enrollment.activity_type),
      activityType: enrollment.activity_type,
      status: enrollment.status,
      startDate,
      endDate,
      day,
      totalDays: TOTAL_DAYS,
      daysUntilStart
    },
    totalValue: Math.round(total * 100) / 100,
    percent: Math.round(percent * 10) / 10,
    thisWeekValue: Math.round(week.value * 100) / 100,
    thisWeekActivities: week.activities,
    nextMilestone: nextMilestone(total, thresholds),
    milestones: milestones.map((m) => ({
      threshold: Number(m.threshold),
      reached: !!m.reached_at
    })),
    status: await enrollmentStatus(enrollment, total, last ? last.date : null)
  };
}

module.exports = {
  dayNumber,
  totalForEnrollment,
  thisWeekForEnrollment,
  nextMilestone,
  reachedThresholds,
  enrollmentStatus,
  enrollmentSummary,
  TOTAL_DAYS
};