const db = require('../db');
const { hasStravaOverlap } = require('../lib/dedupe');
const { totalForEnrollment } = require('./progress');
const { emitProgressEvents } = require('./progressEvents');
const { getActiveChallenge } = require('./challengeWindow');
const { todayISO } = require('../lib/dates');

async function getEnrollmentForUser(userId) {
  const challenge = await getActiveChallenge();
  if (!challenge) return null;
  return db('enrollments').where({ user_id: userId, challenge_id: challenge.id }).first();
}

// Logs a manual activity for a member. Shared by the HTTP route and the
// Telegram /checkin command. Returns { ok, ... } or { ok:false, reason }.
async function logActivity({ user, date, quantity, activityType, notes }) {
  const enrollment = await getEnrollmentForUser(user.id);
  if (!enrollment) {
    return { ok: false, reason: 'no-enrollment' };
  }

  const challenge = await getActiveChallenge();
  // Logging is enabled from the day a member starts (no launch gate). The
  // lower bound opens to "today" before the official start; end_date stays the
  // hard cap.
  if (challenge) {
    const lower = todayISO() < challenge.start_date ? todayISO() : challenge.start_date;
    if (date < lower || date > challenge.end_date) {
      return { ok: false, reason: 'out-of-window', start: lower, end: challenge.end_date };
    }
  }

  const sameDateRows = await db('challenge_activities').where({ enrollment_id: enrollment.id, date });
  const overlapping = hasStravaOverlap(sameDateRows);

  const [id] = await db('challenge_activities').insert({
    enrollment_id: enrollment.id,
    date,
    quantity,
    activity_type: activityType,
    source: 'manual',
    notes: notes || null
  });

  const total = await totalForEnrollment(enrollment.id);
  const { reached, finished } = await emitProgressEvents({ enrollment, total, user });

  return {
    ok: true,
    id,
    total,
    finished,
    overlapping,
    milestonesReached: reached
  };
}

module.exports = { logActivity, getEnrollmentForUser };