const config = require('../config');
const db = require('../db');
const telegramMessenger = require('./telegramMessenger');

// Admin alerting via the bot: when a major system event happens (boot failure,
// DB saturation, webhook down, scheduler errors, unexpected process errors),
// the admin is DM'd so they can react instead of discovering it in logs later.
//
// Recipients: TELEGRAM_ADMIN_ID (comma-separated, optional override) OR every
// admin account with an active Telegram link. Per-category cooldown prevents
// the bot from spamming during an incident.
const COOLDOWN_MS = Number(process.env.ADMIN_ALERT_COOLDOWN_MS || 15 * 60 * 1000);
const lastSent = {};

async function adminTelegramIds() {
  const envIds = (process.env.TELEGRAM_ADMIN_ID || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const ids = [...envIds];
  if (ids.length) return ids;

  const rows = await db('admins')
    .join('users', 'users.id', 'admins.user_id')
    .join('telegram_connections', 'telegram_connections.user_id', 'users.id')
    .where('telegram_connections.state', 'active')
    .select('telegram_connections.telegram_user_id as tg');
  for (const r of rows) {
    const tg = Number(r.tg);
    if (tg && !ids.includes(tg)) ids.push(tg);
  }
  return ids;
}

// Sends a raw message to the admin(s) via the bot (no alert prefix, no cooldown).
// Used by scheduled digests. Fire-and-forget, dry-run safe.
async function sendAdminMessage(text) {
  if (!config.telegram.botToken && !process.env.TELEGRAM_DRY_RUN) {
    return { sent: false, reason: 'no-bot' };
  }
  let ids = [];
  try {
    ids = await adminTelegramIds();
  } catch (err) {
    console.error('[adminAlerts] could not resolve admin telegram ids:', err.message);
  }
  if (!ids.length) return { sent: false, reason: 'no-admin-tg' };
  for (const tg of ids) telegramMessenger.sendToChat(tg, text);
  return { sent: true, to: ids.length };
}

// Sends an admin alert (fire-and-forget, dry-run safe). Returns { sent, reason }.
async function alertAdmins(message, { category = 'system', force = false } = {}) {
  const now = Date.now();
  if (!force && lastSent[category] && now - lastSent[category] < COOLDOWN_MS) {
    return { sent: false, reason: 'cooldown' };
  }
  const res = await sendAdminMessage(`🟠 ADMIN ALERT\n\n${message}`);
  if (res.sent) lastSent[category] = now;
  return res;
}

module.exports = { alertAdmins, sendAdminMessage, adminTelegramIds, COOLDOWN_MS };