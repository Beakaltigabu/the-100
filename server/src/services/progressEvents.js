const db = require('../db');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { syncMilestones } = require('./milestones');
const { createNotification, telegramAllowed } = require('./notifications');
const { awardBadge } = require('./badges');
const telegramMessenger = require('./telegramMessenger');
const botSettings = require('./botSettings');
const botGroupGuard = require('./botGroupGuard');
const botMessages = require('./botMessagesV2');

// Only milestones >= this are broadcast as a community "major member moment".
const MAJOR_MILESTONE_KM = 100;

// Shared by manual logging (logActivity), the Telegram /checkin path, and the
// Strava webhook. Emits milestone notifications/broadcasts for thresholds just
// crossed, and immediately completes the enrollment when the member reaches
// their goal (previously only detected by the scheduler, up to 6h later).
// Returns { reached, finished }.
async function emitProgressEvents({ enrollment, total, user, actorName, added }) {
  const reached = await syncMilestones(enrollment.id, total);
  if (reached.length) await awardBadge(user.id, 'first_milestone');
  const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
  const name = actorName || user.name || 'Member';
  const goal = Number(enrollment.goal_value) || 0;
  const pct = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;
  const settings = await botSettings.getSettings(user.id);
  const shareMarkup = {
    inline_keyboard: [
      [{ text: '📊 VIEW PROGRESS', callback_data: 'progress' }]
    ]
  };
  const finishMarkup = {
    inline_keyboard: [
      [{ text: 'WHAT\u2019S NEXT?', callback_data: 'whats_next' }]
    ]
  };

  // Group catalyst moments (community group only, capped by the guard).
  const groupLive = await botGroupGuard.isGroupLive();
  const firstActivity = added > 0 && total - added <= 0;
  if (groupLive && firstActivity) {
    await botGroupGuard.sendToCommunity(botMessages.groupMemberFirstStep({ name }));
  }

  for (const threshold of reached) {
    await createNotification({
      userId: user.id,
      type: 'milestone',
      title: `You just hit ${threshold} ${unitLabel}.`,
      body: `You reached the ${threshold} ${unitLabel} milestone. Keep moving.`
    });
    if (settings.milestonesOn && (await telegramAllowed(user.id, 'milestone'))) {
      telegramMessenger.sendToUser(
        user.id,
        botMessages.milestoneHit({ threshold, unit: unitLabel, goal, pct }),
        shareMarkup
      );
    }
    if (groupLive && threshold >= MAJOR_MILESTONE_KM) {
      await botGroupGuard.sendToCommunity(botMessages.groupMemberMilestone({ name, threshold, unit: unitLabel, goal }));
    }
  }

  let finished = false;
  if (total >= goal) {
    // Atomic conditional flip: only the caller that actually changes the row
    // notifies/broadcasts, so concurrent logs can't double-announce a finish.
    const flipped = await db('enrollments')
      .where({ id: enrollment.id })
      .whereIn('status', ['committed', 'active'])
      .update({ status: 'completed', completed_at: db.fn.now() });
    if (flipped === 1) {
      await awardBadge(user.id, 'finisher');
      await createNotification({
        userId: user.id,
        type: 'finish',
        title: 'YOU DID IT.',
        body: `You reached ${goal} ${unitLabel}. You finished what you started.`
      });
      if (await telegramAllowed(user.id, 'finish')) {
        telegramMessenger.sendToUser(user.id, botMessages.completion({ goal, unit: unitLabel }), finishMarkup);
      }
      if (groupLive) {
        await botGroupGuard.sendToCommunity(botMessages.groupMemberFinish({ name, goal, unit: unitLabel }));
      }
      finished = true;
    }
  }

  return { reached, finished };
}

// Short transactional confirmation when an activity syncs (manual logging via
// the bot already confirms inline, so this is only for Strava imports).
async function sendActivityConfirm({ user, enrollment, added, total }) {
  const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
  const goal = Number(enrollment.goal_value) || 0;
  const pct = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;
  const next = await db('milestones').where({ enrollment_id: enrollment.id }).whereNull('reached_at').orderBy('threshold', 'asc').first();
  telegramMessenger.sendToUser(
    user.id,
    botMessages.activityConfirmed({
      distance: Math.round(added * 100) / 100,
      unit: unitLabel,
      total: Math.round(total * 100) / 100,
      goal,
      pct,
      next: next ? Number(next.threshold) : null,
      remainingToNext: next ? Math.round(Math.max(0, Number(next.threshold) - total) * 100) / 100 : 0
    })
  );
}

module.exports = { emitProgressEvents, sendActivityConfirm };