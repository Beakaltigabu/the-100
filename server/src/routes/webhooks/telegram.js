const express = require('express');
const { hashToken } = require('../../lib/tokens');
const { AppError } = require('../../middleware/errors');
const { timingSafeEqualStr } = require('../../lib/timing');
const { enqueue } = require('../../services/queue');
const { logEvent } = require('../../services/logger');
const { unitForActivity, UNIT_LABEL } = require('../../constants');

// Dependencies are injectable so the handlers can be unit-tested without a
// database. Production wires in the real singletons below; tests override via
// __setDeps().
const deps = {
  db: require('../../db'),
  config: require('../../config'),
  messenger: require('../../services/telegramMessenger'),
  botMessages: require('../../services/botMessages'),
  logActivity: require('../../services/logActivity'),
  computeStreaks: require('../../services/streaks').computeStreaks,
  challengeWindow: require('../../services/challengeWindow'),
  dates: require('../../lib/dates'),
  helpers: require('../../lib/telegram')
};

function __setDeps(overrides) {
  Object.assign(deps, overrides);
  return deps;
}

// Recent-welcome dedupe: approving a join request usually ALSO produces a
// `new_chat_members` update, which would otherwise double-welcome in the group.
const recentlyWelcomed = new Map();
const WELCOME_WINDOW_MS = 2 * 60 * 1000;

function isRecentlyWelcomed(tgUserId) {
  const at = recentlyWelcomed.get(tgUserId);
  if (at && Date.now() - at < WELCOME_WINDOW_MS) return true;
  return false;
}

function markWelcome(tgUserId) {
  if (recentlyWelcomed.size > 5000) recentlyWelcomed.clear();
  recentlyWelcomed.set(tgUserId, Date.now());
}

const router = express.Router();

function validateBotToken(req) {
  if (!deps.config.telegram.botToken) {
    throw new AppError('Telegram bot not configured', 503);
  }
  const secret = req.get('X-Telegram-Bot-Api-Secret-Token');
  const expected = hashToken(deps.config.telegram.botToken).slice(0, 32);
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
  const message = update.message;
  let kind = 'unknown';
  if (message && message.new_chat_members && message.new_chat_members.length) kind = 'new_members';
  else if (message && message.text) kind = 'command';
  else if (update.chat_join_request) kind = 'join_request';
  else if (update.my_chat_member) kind = 'my_chat_member';
  logEvent({ source: 'webhook', type: 'telegram_update', message: `telegram update (${kind})`, meta: { kind } });

  if (message && message.new_chat_members && message.new_chat_members.length) {
    enqueue(() => handleNewMembers(message));
  } else if (message && message.text && message.chat && message.chat.type === 'private') {
    enqueue(() => handleMessage(message));
  } else if (update.chat_join_request) {
    enqueue(() => handleJoinRequest(update.chat_join_request));
  } else if (update.my_chat_member) {
    enqueue(() => handleMyChatMember(update.my_chat_member));
  }
  res.json({ ok: true });
});

async function getConnByTelegramId(userId) {
  return deps.db('telegram_connections').where({ telegram_user_id: userId }).first();
}

async function getEnrollment(userId) {
  return deps.db('enrollments')
    .join('challenges', 'challenges.id', 'enrollments.challenge_id')
    .where({ 'enrollments.user_id': userId, 'challenges.is_active': true })
    .select('enrollments.*')
    .first();
}

async function getTotal(enrollmentId) {
  const r = await deps.db('challenge_activities')
    .where({ enrollment_id: enrollmentId })
    .sum({ s: 'quantity' })
    .first();
  return Number(r.s) || 0;
}

async function handleMessage(message) {
  // Commands are only meaningful in a private chat — never run them in the
  // community group (no public /checkin, no progress leaked into the group).
  if (!message.chat || message.chat.type !== 'private') return;

  const chatId = message.chat.id;
  const userId = message.from && message.from.id;
  const text = (message.text || '').trim();
  const send = (str, markup) => deps.messenger.sendToChat(chatId, str, markup);

  const conn = await getConnByTelegramId(userId);
  const lang = conn
    ? await deps.messenger.getUserLanguage(conn.user_id)
    : deps.helpers.resolveLanguage(message.from && message.from.language_code);

  if (text.startsWith('/start')) {
    const token = text.split(' ')[1] || '';
    if (!token) {
      // Bare /start: if the sender is already linked, welcome them back with
      // their own data + the group invite instead of the "go to the app"
      // instructions. (Deep-link `?start=` payloads can be dropped by some
      // Telegram clients, so this covers the from-the-app path too.)
      const existing = await getConnByTelegramId(userId);
      if (existing && existing.state === 'active') {
        const wl = await deps.messenger.getUserLanguage(existing.user_id);
        const enrollment = await getEnrollment(existing.user_id);
        if (enrollment) {
          const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
          const challenge = await deps.challengeWindow.getActiveChallenge();
          const started = deps.challengeWindow.hasChallengeStarted(challenge);
          const day = started
            ? Math.min(100, Math.max(1, deps.dates.diffDays(enrollment.start_date, deps.dates.todayISO()) + 1))
            : null;
          return send(deps.botMessages.welcomeBack(wl, enrollment.goal_value, unitLabel, day), deps.messenger.joinCommunityMarkup(wl));
        }
        return send(deps.botMessages.alreadyLinked(wl), deps.messenger.joinCommunityMarkup(wl));
      }
      return send(
        deps.botMessages.welcomeNoToken(lang, deps.config.clientOrigin, deps.config.telegram.groupLink),
        deps.messenger.joinCommunityMarkup(lang)
      );
    }
    const linkConn = await deps.db('telegram_connections').where({ link_token_hash: hashToken(token) }).first();
    if (!linkConn || !linkConn.link_expires_at || new Date(linkConn.link_expires_at).getTime() < Date.now()) {
      return send(deps.botMessages.invalidToken(lang));
    }
    const linkLang = await deps.messenger.getUserLanguage(linkConn.user_id);
    if (linkConn.state === 'active') {
      return send(deps.botMessages.alreadyLinked(linkLang));
    }
    await deps.db('telegram_connections').where({ id: linkConn.id }).update({
      telegram_user_id: userId,
      state: 'active',
      link_token_hash: null,
      link_expires_at: null,
      updated_at: deps.db.fn.now()
    });
    const enrollment = await getEnrollment(linkConn.user_id);
    if (enrollment) {
      const unitLabel = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
      return send(
        deps.botMessages.welcomeLinked(linkLang, enrollment.goal_value, unitLabel, enrollment.start_date, deps.config.telegram.groupLink),
        deps.messenger.joinCommunityMarkup(linkLang)
      );
    }
    return send(deps.botMessages.noEnrollment(linkLang));
  }

  if (text === '/help') {
    return send(deps.botMessages.help(lang));
  }

  if (text.startsWith('/language')) {
    const arg = (text.split(' ')[1] || '').toLowerCase();
    if (arg !== 'en' && arg !== 'am') {
      return send(deps.botMessages.languageUsage(lang));
    }
    if (!conn) {
      return send(deps.botMessages.notLinked(lang));
    }
    await deps.db('users').where({ id: conn.user_id }).update({ language: arg });
    return send(deps.botMessages.languageSet(arg));
  }

  // Everything below needs a linked account.
  if (!conn) {
    return send(deps.botMessages.notLinked(lang));
  }

  const enrollment = await getEnrollment(conn.user_id);
  const challenge = await deps.challengeWindow.getActiveChallenge();
  const started = deps.challengeWindow.hasChallengeStarted(challenge);
  const unitLabel = enrollment ? UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM' : 'KM';

  if (text === '/disconnect') {
    await deps.db('telegram_connections').where({ id: conn.id }).update({
      state: 'left',
      telegram_user_id: null,
      link_token_hash: null,
      link_expires_at: null,
      updated_at: deps.db.fn.now()
    });
    return send(deps.botMessages.disconnected(lang));
  }

  if (text === '/status') {
    if (!enrollment) return send(deps.botMessages.noEnrollment(lang));
    if (!started) {
      const days = Math.max(0, deps.dates.diffDays(deps.dates.todayISO(), challenge.start_date));
      return send(deps.botMessages.statusPreLaunch(lang, enrollment.goal_value, unitLabel, days, challenge.start_date));
    }
    const total = await getTotal(enrollment.id);
    const day = Math.min(100, Math.max(1, deps.dates.diffDays(enrollment.start_date, deps.dates.todayISO()) + 1));
    return send(deps.botMessages.statusReply(lang, enrollment.goal_value, total, unitLabel, day));
  }

  if (text === '/day') {
    if (!enrollment) return send(deps.botMessages.noEnrollment(lang));
    if (!started) {
      const days = Math.max(0, deps.dates.diffDays(deps.dates.todayISO(), challenge.start_date));
      return send(deps.botMessages.dayPreLaunch(lang, days, challenge.start_date));
    }
    const day = Math.min(100, Math.max(1, deps.dates.diffDays(enrollment.start_date, deps.dates.todayISO()) + 1));
    return send(deps.botMessages.dayReply(lang, day));
  }

  if (text === '/goal') {
    if (!enrollment) return send(deps.botMessages.noEnrollment(lang));
    const pace = Math.round((Number(enrollment.goal_value) / (100 / 7)) * 10) / 10;
    return send(deps.botMessages.goalReply(lang, enrollment.goal_value, unitLabel, pace));
  }

  if (text === '/streaks') {
    const streaks = await deps.computeStreaks(8);
    if (!streaks.length) return send(deps.botMessages.streaksEmpty(lang));
    const body = streaks.map((s) => `${deps.botMessages.esc(s.name)} — <b>${s.days}</b> days`).join('\n');
    return send(deps.botMessages.streaksReply(lang, body));
  }

  if (text.startsWith('/checkin')) {
    if (!enrollment) return send(deps.botMessages.noEnrollment(lang));

    const raw = text.split(/\s+/)[1];
    const cap = Math.max(1, Math.min(Number(enrollment.goal_value) * 2, 1000));
    const quantity = deps.helpers.parseCheckin(raw, cap);
    if (quantity === null) {
      return send(deps.botMessages.checkinInvalid(lang));
    }

    const user = await deps.db('users').where({ id: conn.user_id }).first();
    const result = await deps.logActivity({
      user,
      date: deps.dates.todayISO(),
      quantity,
      activityType: enrollment.activity_type,
      notes: 'via Telegram'
    });

    if (!result.ok) {
      if (result.reason === 'not-started') return send(deps.botMessages.checkinClosed(lang, result.start));
      if (result.reason === 'out-of-window') {
        return send(deps.botMessages.checkinOutsideWindow(lang, result.start, result.end));
      }
      return send(deps.botMessages.noEnrollment(lang));
    }

    return send(deps.botMessages.checkinSuccess(lang, quantity, unitLabel, result.total, enrollment.goal_value));
  }

  return send(deps.botMessages.unknown(lang));
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
      const challenge = await deps.challengeWindow.getActiveChallenge();
      if (deps.challengeWindow.hasChallengeStarted(challenge)) {
        ctx.day = Math.min(100, Math.max(1, deps.dates.diffDays(enrollment.start_date, deps.dates.todayISO()) + 1));
      }
    }
  }
  return ctx;
}

async function handleNewMembers(message) {
  const chatId = message.chat.id;
  for (const member of message.new_chat_members) {
    if (member.is_bot) continue;
    if (isRecentlyWelcomed(member.id)) continue;
    const ctx = await groupWelcomeContext(member.id, member.first_name);
    deps.messenger.sendToChat(chatId, deps.botMessages.groupWelcome(ctx));
  }
}

// Auto-admit linked members who request to join the community group. Unlinked
// requesters are left pending for manual approval and DM'd linking instructions
// (localized from the sender's Telegram language when possible).
async function handleJoinRequest(joinRequest) {
  const chatId = joinRequest.chat.id;
  const userId = joinRequest.from.id;
  const conn = await getConnByTelegramId(userId);
  if (conn && conn.state === 'active') {
    const approved = await deps.messenger.approveJoinRequest(chatId, userId);
    if (approved && !isRecentlyWelcomed(userId)) {
      markWelcome(userId);
      const ctx = await groupWelcomeContext(userId, joinRequest.from.first_name);
      deps.messenger.sendToChat(chatId, deps.botMessages.groupWelcome(ctx));
    }
  } else {
    const reqLang = deps.helpers.resolveLanguage(joinRequest.from && joinRequest.from.language_code);
    deps.messenger.sendToChat(
      userId,
      deps.botMessages.welcomeNoToken(reqLang, deps.config.clientOrigin, deps.config.telegram.groupLink),
      deps.messenger.joinCommunityMarkup(reqLang)
    );
  }
}

// Track membership changes so `left` / `removed` states are recorded instead of
// staying permanently `active`. Kicked/left members and blocked bots are flipped
// out of `active` so they stop receiving DMs.
async function handleMyChatMember(update) {
  const status = update.new_chat_member && update.new_chat_member.status;
  const member = update.new_chat_member && update.new_chat_member.user;
  if (!member || member.is_bot) return;
  if (status !== 'left' && status !== 'kicked') return;
  const newState = status === 'kicked' ? 'removed' : 'left';
  await deps.db('telegram_connections')
    .where({ telegram_user_id: member.id, state: 'active' })
    .update({ state: newState, updated_at: deps.db.fn.now() });
}

module.exports = router;
module.exports.handleMessage = handleMessage;
module.exports.handleNewMembers = handleNewMembers;
module.exports.handleJoinRequest = handleJoinRequest;
module.exports.handleMyChatMember = handleMyChatMember;
module.exports.__setDeps = __setDeps;