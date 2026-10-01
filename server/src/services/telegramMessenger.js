const config = require('../config');
const db = require('../db');
const { enqueue } = require('./queue');
const { logEvent } = require('./logger');

function configured() {
  return !!config.telegram.botToken || dryRun();
}

// TELEGRAM_DRY_RUN=true logs every send instead of hitting Telegram — safe for
// local testing without touching the live bot/group.
function dryRun() {
  return process.env.TELEGRAM_DRY_RUN === 'true';
}

// Deliver delay for outbound sends (default 2000ms). Integration tests set
// TELEGRAM_SEND_DELAY=0 so sends drain deterministically.
function sendDelay() {
  const n = Number(process.env.TELEGRAM_SEND_DELAY);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

async function deliver(chatId, text, markup) {
  if (dryRun()) {
    logEvent({
      source: 'bot',
      type: 'send_dry_run',
      message: `[dry-run] to ${chatId}${markup ? ' [kb]' : ''}: ${String(text).slice(0, 200)}`
    });
    return;
  }
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (markup) payload.reply_markup = markup;
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text();
    logEvent({
      source: 'bot',
      type: 'send_fail',
      message: `sendMessage to ${chatId} failed: ${res.status}`,
      meta: { chatId: String(chatId), status: res.status, detail: body.slice(0, 200) }
    });
    const err = new Error(`Telegram sendMessage failed: ${res.status} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err; // let the queue retry transient failures
  }
  logEvent({
    source: 'bot',
    type: 'send_ok',
    message: `sent to ${chatId}`,
    meta: { chatId: String(chatId), length: text.length }
  });
}

// Language of a member (for bilingual bot messages).
async function getUserLanguage(userId) {
  const user = await db('users').where({ id: userId }).first();
  return (user && user.language) || 'en';
}

// Acknowledge a button press (callback_query) so Telegram clears the spinner.
async function answerCallbackQuery(callbackQueryId, text) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) logEvent({ source: 'bot', type: 'callback_answer_fail', message: `answerCallbackQuery failed: ${res.status}` });
  } catch (err) {
    console.error('answerCallbackQuery error:', err.message);
  }
}

// ── Send a DM to a linked member (fire-and-forget, retried on failure).
function sendToUser(userId, text, markup) {
  if (!configured()) return;
  enqueue(
    async () => {
      const conn = await db('telegram_connections').where({ user_id: userId, state: 'active' }).first();
      if (conn && conn.telegram_user_id) {
        // Global ban: never message a banned account.
        const user = await db('users').where({ id: userId }).first();
        if (user && user.banned_at) return;
        await deliver(conn.telegram_user_id, text, markup);
      }
    },
    { maxAttempts: 3, delay: sendDelay() }
  );
}

// Post to the brand's group/channel (no-op until TELEGRAM_GROUP_ID is set).
function sendToGroup(text) {
  if (!configured() || !config.telegram.groupId) return;
  enqueue(() => deliver(config.telegram.groupId, text), { maxAttempts: 3, delay: sendDelay() });
}

// Reply to a specific chat (used by the webhook handler).
function sendToChat(chatId, text, markup) {
  if (!configured()) return;
  enqueue(() => deliver(chatId, text, markup), { maxAttempts: 3, delay: sendDelay() });
}

// Inline "JOIN THE COMMUNITY" button pointing at the private community group.
function joinCommunityMarkup(lang) {
  const url = config.telegram.groupLink;
  if (!url) return undefined;
  return {
    inline_keyboard: [[{ text: lang === 'am' ? 'ማህበረሰቡን ይቀላቀሉ' : 'JOIN THE COMMUNITY', url }]]
  };
}

// Approve a pending chat join request (requires the bot to be admin). Honors the
// HTTP response so callers can tell a real failure from success.
async function approveJoinRequest(chatId, userId) {
  if (dryRun()) return true;
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/approveChatJoinRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, user_id: userId })
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram approveChatJoinRequest failed:', res.status, body.slice(0, 200));
    return false;
  }
  return true;
}

// Reads the currently registered webhook. Returns null when the bot isn't
// configured or Telegram is unreachable.
async function getWebhookInfo() {
  if (!configured()) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/getWebhookInfo`);
    const data = await res.json();
    return data && data.ok ? data.result : null;
  } catch (err) {
    console.error('Telegram getWebhookInfo error:', err.message);
    return null;
  }
}

module.exports = {
  sendToUser,
  sendToGroup,
  sendToChat,
  getUserLanguage,
  joinCommunityMarkup,
  approveJoinRequest,
  getWebhookInfo,
  answerCallbackQuery
};