const db = require('../db');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { syncMilestones } = require('./milestones');
const { createNotification } = require('./notifications');
const telegramMessenger = require('./telegramMessenger');
const botMessages = require('./botMessages');

// Shared by manual logging (logActivity), the Telegram /checkin path, and the
// Strava webhook. Emits milestone notifications/broadcasts for thresholds just
// crossed, and immediately completes the enrollment when the member reaches
// their goal (previously only detected by the scheduler, up to 6h later).
// Returns { reached, finished }.
async function emitProgressEvents({ enrollment, total, user, actorName }) {
  const reached = await syncMilestones(enrollment.id, total);
  const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
  const lang = await telegramMessenger.getUserLanguage(user.id);
  const name = actorName || user.name || 'Member';

  for (const threshold of reached) {
    await createNotification({
      userId: user.id,
      type: 'milestone',
      title: `You just hit ${threshold} ${unitLabel}.`,
      body: `You reached the ${threshold} ${unitLabel} milestone. Keep moving.`
    });
    telegramMessenger.sendToUser(user.id, botMessages.milestoneHit(lang, threshold, unitLabel));
    telegramMessenger.broadcastMilestone(name, threshold, unitLabel);
  }

  let finished = false;
  const goal = Number(enrollment.goal_value);
  if (total >= goal) {
    // Atomic conditional flip: only the caller that actually changes the row
    // notifies/broadcasts, so concurrent logs can't double-announce a finish.
    const flipped = await db('enrollments')
      .where({ id: enrollment.id })
      .whereIn('status', ['committed', 'active'])
      .update({ status: 'completed', completed_at: db.fn.now() });
    if (flipped === 1) {
      await createNotification({
        userId: user.id,
        type: 'finish',
        title: 'YOU DID IT.',
        body: `You reached ${goal} ${unitLabel}. You finished what you started.`
      });
      telegramMessenger.sendToUser(user.id, botMessages.finish(lang, goal, unitLabel));
      telegramMessenger.broadcastFinish(name, goal, unitLabel);
      finished = true;
    }
  }

  return { reached, finished };
}

module.exports = { emitProgressEvents };