const db = require('../db');
const push = require('./push');

// Absent preference row = enabled (defaults on). Admin messages and nudges pass
// `force: true` and ignore preferences entirely.
async function prefAllowed(userId, channel, type) {
  const row = await db('notification_preferences')
    .where({ user_id: userId, channel, type })
    .first();
  return row ? !!row.enabled : true;
}

async function webAllowed(userId, type) {
  return prefAllowed(userId, 'web', type);
}

async function telegramAllowed(userId, type) {
  return prefAllowed(userId, 'telegram', type);
}

async function pushAllowed(userId, type) {
  return prefAllowed(userId, 'push', type);
}

async function createNotification({ userId, type, title, body, channel = 'web', force = false }) {
  if (channel === 'web' && !force && !(await webAllowed(userId, type))) return null;
  const [id] = await db('notifications').insert({
    user_id: userId,
    type,
    title: String(title).slice(0, 120),
    body: String(body).slice(0, 2000),
    channel,
    sent_at: db.fn.now()
  });
  // Web notifications also fan out to the user's registered push endpoints
  // (respecting push prefs unless force — admin messages/nudges always push).
  if (channel === 'web') {
    const allowPush = force ? true : await pushAllowed(userId, type);
    if (allowPush) {
      push.sendPush(userId, { title, body }).catch((err) => console.error('Push send error:', err.message));
    }
  }
  return id;
}

// Bounded: a user accumulates weekly/inactivity notifications every challenge,
// so never return the unbounded history.
async function listForUser(userId, limit = 50) {
  return db('notifications').where({ user_id: userId }).orderBy('created_at', 'desc').limit(limit);
}

async function unreadCountForUser(userId) {
  const row = await db('notifications').where({ user_id: userId }).whereNull('read_at').count({ c: '*' }).first();
  return Number(row.c);
}

async function markRead(userId, id) {
  const updated = await db('notifications')
    .where({ id, user_id: userId })
    .whereNull('read_at')
    .update({ read_at: db.fn.now() });
  return updated > 0;
}

async function markAllRead(userId) {
  await db('notifications').where({ user_id: userId }).whereNull('read_at').update({ read_at: db.fn.now() });
}

// Preferences: return an object keyed by `${channel}:${type}`.
async function getPreferences(userId) {
  const rows = await db('notification_preferences').where({ user_id: userId });
  const prefs = {};
  for (const r of rows) prefs[`${r.channel}:${r.type}`] = !!r.enabled;
  return prefs;
}

// Prefs = [{ channel, type, enabled }] (disabled-only upserts; absent = enabled).
async function setPreferences(userId, prefs) {
  if (!Array.isArray(prefs)) return;
  const rows = prefs.filter((p) => p && p.channel && p.type);
  for (const p of rows) {
    await db('notification_preferences')
      .insert({ user_id: userId, channel: String(p.channel).slice(0, 20), type: String(p.type).slice(0, 30), enabled: !!p.enabled })
      .onConflict(['user_id', 'channel', 'type'])
      .merge({ enabled: !!p.enabled, updated_at: db.fn.now() });
  }
}

module.exports = {
  createNotification,
  listForUser,
  unreadCountForUser,
  markRead,
  markAllRead,
  prefAllowed,
  webAllowed,
  telegramAllowed,
  pushAllowed,
  getPreferences,
  setPreferences
};