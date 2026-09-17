const express = require('express');
const db = require('../../db');
const config = require('../../config');
const { hashToken } = require('../../lib/tokens');
const { AppError } = require('../../middleware/errors');
const { timingSafeEqualStr } = require('../../lib/timing');
const { enqueue } = require('../../services/queue');
const { unitForActivity, UNIT_LABEL } = require('../../constants');
const { todayISO, diffDays } = require('../../lib/dates');
const botMessages = require('../../services/botMessages');
const telegramMessenger = require('../../services/telegramMessenger');
const { getActiveChallenge, hasChallengeStarted } = require('../../services/challengeWindow');
const { logActivity } = require('../../services/logActivity');
const { computeStreaks } = require('../../services/streaks');

const router = express.Router();

function validateBotToken(req) {
  if (!config.telegram.botToken) {
    throw new AppError('Telegram bot not configured', 503);
  }
  const secret = req.get('X-Telegram-Bot-Api-Secret-Token');
  const expected = hashToken(config.telegram.botToken).slice(0, 32);
  if (!timingSafeEqualStr(secret, expected)) {
    throw new AppError('Invalid webhook secret', 401);
  }
}

router.post('/', (req, res) => {
  try {
    validateBotToken(req);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  const update = req.body;
  const message = update.message || update.edited_message;
  if (message && message.new_chat_members && message.new_chat_members.length) {
    enqueue(() => handleNewMembers(message));
  } else if (message && message.text) {
    enqueue(() => handleMessage(message));
  } else if (update.chat_join_request) {
    enqueue(() => handleJoinRequest(update.chat_join_request));
  }
  res.json({ ok: true });
});

async function getConnByTelegramId(userId) {
  return db('telegram_connections').where({ telegram_user_id: userId }).first();
}

async function getEnrollment(userId) {
  return db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': userId, 'challenges.is_active': true })
    .first();
}

async function getTotal(enrollmentId) {
  const r = await db('challenge_activities').where({ enrollment_id: enrollmentId }).sum({ s: 'quantity' }).first();
  return Number(r.s) || 0;
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from && message.from.id;
  const text = (message.text || '').trim();
  const send = (str, markup) => telegramMessenger.sendToChat(chatId, str, markup);

  const conn = await getConnByTelegramId(userId);
  const lang = conn ? await telegramMessenger.getUserLanguage(conn.user_id) : 'en';

  if (text.startsWith('/start')) {
    const token = text.split(' ')[1] || '';
    if (!token) {
      return send(botMessages.welcomeNoToken(lang, config.clientOrigin, config.telegram.groupLink), telegramMessenger.joinCommunityMarkup(lang));
    }
    const linkConn = await db('telegram_connections').where({ link_token_hash: hashToken(token) }).first();
    if (!linkConn || !linkConn.link_expires_at || new Date(linkConn.link_expires_at).getTime() < Date.now()) {
      return send(botMessages.invalidToken(lang));
    }
    const linkLang = await telegramMessenger.getUserLanguage(linkConn.user_id);
    if (linkConn.state === 'active') {
      return send(botMessages.alreadyLinked(linkLang));
    }
    await db('telegram_connections').where({ id: linkConn.id }).update({
      telegram_user_id: userId,
      state: 'active',
      link_token_hash: null,
      link_expires_at: null,
      updated_at: db.fn.now()
    });
    const enrollment = await getEnrollment(linkConn.user_id);
    if (enrollment) {
      const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
      return send(botMessages.welcomeLinked(linkLang, enrollment.goal_value, unitLabel, enrollment.start_date, config.telegram.groupLink), telegramMessenger.joinCommunityMarkup(linkLang));
    }
    return send(botMessages.noEnrollment(linkLang));
  }

  if (text === '/help') {
    return send(botMessages.help(lang));
  }

  if (text.startsWith('/language')) {
    const arg = (text.split(' ')[1] || '').toLowerCase();
    if (arg !== 'en' && arg !== 'am') {
      return send(botMessages.languageUsage(lang));
    }
    if (conn) {
      await db('users').where({ id: conn.user_id }).update({ language: arg });
    }
    return send(botMessages.languageSet(arg));
  }

  // Everything below needs a linked account.
  if (!conn) {
    return send(botMessages.notLinked(lang));
  }

  const enrollment = await getEnrollment(conn.user_id);
  const challenge = await getActiveChallenge();
  const started = hasChallengeStarted(challenge);
  const unitLabel = enrollment ? UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM' : 'KM';

  if (text === '/status') {
    if (!enrollment) return send(botMessages.noEnrollment(lang));
    if (!started) {
      const days = Math.max(0, diffDays(todayISO(), challenge.start_date));
      return send(botMessages.statusPreLaunch(lang, enrollment.goal_value, unitLabel, days));
    }
    const total = await getTotal(enrollment.id);
    const day = Math.min(100, Math.max(1, diffDays(enrollment.start_date, todayISO()) + 1));
    return send(botMessages.statusReply(lang, enrollment.goal_value, total, unitLabel, day));
  }

  if (text === '/day') {
    if (!enrollment) return send(botMessages.noEnrollment(lang));
    if (!started) {
      const days = Math.max(0, diffDays(todayISO(), challenge.start_date));
      return send(botMessages.dayPreLaunch(lang, days));
    }
    const day = Math.min(100, Math.max(1, diffDays(enrollment.start_date, todayISO()) + 1));
    return send(botMessages.dayReply(lang, day));
  }

  if (text === '/goal') {
    if (!enrollment) return send(botMessages.noEnrollment(lang));
    const pace = Math.round((Number(enrollment.goal_value) / (100 / 7)) * 10) / 10;
    return send(botMessages.goalReply(lang, enrollment.goal_value, unitLabel, pace));
  }

  if (text === '/streaks') {
    const streaks = await computeStreaks(8);
    if (!streaks.length) return send(botMessages.streaksEmpty(lang));
    const body = streaks.map((s) => `${botMessages.esc(s.name)} — <b>${s.days}</b> days`).join('\n');
    return send(botMessages.streaksReply(lang, body));
  }

  if (text.startsWith('/checkin')) {
    if (!enrollment) return send(botMessages.noEnrollment(lang));
    if (!started) return send(botMessages.checkinClosed(lang, challenge.start_date));

    const raw = text.split(/\s+/)[1];
    const quantity = parseFloat(raw);
    if (!raw || Number.isNaN(quantity) || quantity <= 0) {
      return send(botMessages.checkinInvalid(lang));
    }

    const user = await db('users').where({ id: conn.user_id }).first();
    const result = await logActivity({
      user,
      date: todayISO(),
      quantity,
      activityType: enrollment.activity_type,
      notes: 'via Telegram'
    });

    if (!result.ok) {
      if (result.reason === 'not-started') return send(botMessages.checkinClosed(lang, result.start));
      if (result.reason === 'out-of-window') {
        return send(botMessages.checkinOutsideWindow(lang, result.start, result.end));
      }
      return send(botMessages.noEnrollment(lang));
    }

    return send(botMessages.checkinSuccess(lang, quantity, unitLabel, result.total, enrollment.goal_value));
  }

  return send(botMessages.unknown(lang));
}

// Build a context-aware group welcome: linked+goal, linked no goal, or not linked.
async function groupWelcomeContext(tgUserId, firstName) {
  const ctx = { name: firstName || 'friend', linked: false };
  const conn = await getConnByTelegramId(tgUserId);
  if (conn && conn.state === 'active') {
    ctx.linked = true;
    const enrollment = await getEnrollment(conn.user_id);
    if (enrollment) {
      ctx.goal = enrollment.goal_value;
      ctx.unit = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
      const challenge = await getActiveChallenge();
      if (hasChallengeStarted(challenge)) {
        ctx.day = Math.min(100, Math.max(1, diffDays(enrollment.start_date, todayISO()) + 1));
      }
    }
  }
  return ctx;
}

async function handleNewMembers(message) {
  const chatId = message.chat.id;
  for (const member of message.new_chat_members) {
    if (member.is_bot) continue;
    const ctx = await groupWelcomeContext(member.id, member.first_name);
    telegramMessenger.sendToChat(chatId, botMessages.groupWelcome(ctx));
  }
}

// Auto-admit linked members who request to join the community group. Unlinked
// requesters are left pending for manual approval and DM'd linking instructions.
async function handleJoinRequest(joinRequest) {
  const chatId = joinRequest.chat.id;
  const userId = joinRequest.from.id;
  const conn = await getConnByTelegramId(userId);
  if (conn && conn.state === 'active') {
    await telegramMessenger.approveJoinRequest(chatId, userId);
    const ctx = await groupWelcomeContext(userId, joinRequest.from.first_name);
    telegramMessenger.sendToChat(chatId, botMessages.groupWelcome(ctx));
  } else {
    telegramMessenger.sendToChat(
      userId,
      botMessages.welcomeNoToken('en', config.clientOrigin, config.telegram.groupLink),
      telegramMessenger.joinCommunityMarkup('en')
    );
  }
}

module.exports = router;
module.exports.handleMessage = handleMessage;
module.exports.handleNewMembers = handleNewMembers;
module.exports.handleJoinRequest = handleJoinRequest;