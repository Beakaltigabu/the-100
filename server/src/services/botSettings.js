const db = require('../db');

const REMINDER_MODES = ['never', 'occasionally', 'regularly'];

const DEFAULTS = {
  milestones_on: true,
  weekly_on: true,
  community_on: true,
  reminders_mode: 'occasionally'
};

async function getSettings(userId) {
  const row = await db('bot_settings').where({ user_id: userId }).first();
  return {
    milestonesOn: row ? !!row.milestones_on : DEFAULTS.milestones_on,
    weeklyOn: row ? !!row.weekly_on : DEFAULTS.weekly_on,
    communityOn: row ? !!row.community_on : DEFAULTS.community_on,
    remindersMode: row && REMINDER_MODES.includes(row.reminders_mode) ? row.reminders_mode : DEFAULTS.reminders_mode
  };
}

// Applies a partial patch: { milestones?: bool, weekly?: bool, community?: bool,
// reminders?: 'never'|'occasionally'|'regularly' }.
async function updateSettings(userId, patch = {}) {
  const row = await db('bot_settings').where({ user_id: userId }).first();
  const current = row || {};
  const next = {
    milestones_on: patch.milestones !== undefined ? !!patch.milestones : current.milestones_on ?? DEFAULTS.milestones_on,
    weekly_on: patch.weekly !== undefined ? !!patch.weekly : current.weekly_on ?? DEFAULTS.weekly_on,
    community_on: patch.community !== undefined ? !!patch.community : current.community_on ?? DEFAULTS.community_on,
    reminders_mode:
      patch.reminders !== undefined && REMINDER_MODES.includes(patch.reminders)
        ? patch.reminders
        : current.reminders_mode ?? DEFAULTS.reminders_mode
  };
  await db('bot_settings')
    .insert({ user_id: userId, ...next, updated_at: db.fn.now() })
    .onConflict('user_id')
    .merge({ ...next, updated_at: db.fn.now() });
  return getSettings(userId);
}

module.exports = { getSettings, updateSettings, REMINDER_MODES, DEFAULTS };