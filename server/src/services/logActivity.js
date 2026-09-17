const db = require('../db');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { hasStravaOverlap } = require('../lib/dedupe');
const { totalForEnrollment } = require('./progress');
const { syncMilestones } = require('./milestones');
const { createNotification } = require('./notifications');
const telegramMessenger = require('./telegramMessenger');
const botMessages = require('./botMessages');
const { getActiveChallenge, hasChallengeStarted, isInWindow } = require('./challengeWindow');

async function getEnrollmentForUser(userId) {
  const challenge = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
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
  if (!hasChallengeStarted(challenge)) {
    return { ok: false, reason: 'not-started', start: challenge && challenge.start_date };
  }
  if (!isInWindow(date, challenge)) {
    return { ok: false, reason: 'out-of-window', start: challenge.start_date, end: challenge.end_date };
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
  const reached = await syncMilestones(enrollment.id, total);
  const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
  const lang = await telegramMessenger.getUserLanguage(user.id);

  for (const threshold of reached) {
    await createNotification({
      userId: user.id,
      type: 'milestone',
      title: `You just hit ${threshold} ${unitLabel}.`,
      body: `You reached the ${threshold} ${unitLabel} milestone. Keep moving.`
    });
    telegramMessenger.sendToUser(user.id, botMessages.milestoneHit(lang, threshold, unitLabel));
    telegramMessenger.broadcastMilestone(user.name, threshold, unitLabel);
  }

  return {
    ok: true,
    id,
    total,
    unitLabel,
    overlapping,
    milestonesReached: reached
  };
}

module.exports = { logActivity, getEnrollmentForUser };