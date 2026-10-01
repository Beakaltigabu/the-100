const db = require('../db');
const config = require('../config');
const telegramMessenger = require('./telegramMessenger');
const botKeyboard = require('./botKeyboard');
const botMessages = require('./botMessagesV2');
const botState = require('./botState');
const botSettings = require('./botSettings');
const logActivity = require('./logActivity');
const { peopleLikeMe } = require('./peopleLikeMe');
const { getActiveChallenge } = require('./challengeWindow');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { todayISO, addDaysISO } = require('../lib/dates');

const TYPE_LABEL = { running: 'RUN', walking: 'WALK', cycling: 'CYCLE', run_walk: 'RUN/WALK', swimming: 'SWIM', resistance: 'WORKOUT', other: 'MOVE' };

function unitFor(enrollment) {
  return UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';
}

async function connByTg(tgUserId) {
  return db('telegram_connections').where({ telegram_user_id: tgUserId }).first();
}

async function enrollmentFor(userId) {
  const challenge = await getActiveChallenge();
  return challenge
    ? db('enrollments').where({ user_id: userId, challenge_id: challenge.id }).first()
    : null;
}

async function totalFor(enrollmentId) {
  const r = await db('challenge_activities').where({ enrollment_id: enrollmentId }).sum({ s: 'quantity' }).first();
  return Number(r.s) || 0;
}

async function lastActivityDate(enrollmentId) {
  const r = await db('challenge_activities').where({ enrollment_id: enrollmentId }).max({ d: 'date' }).first();
  return r ? r.d : null;
}

function send(chatId, text, keyboard) {
  telegramMessenger.sendToChat(chatId, text, keyboard ? { inline_keyboard: keyboard } : undefined);
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

async function progressData(enrollment, userId) {
  const total = await totalFor(enrollment.id);
  const goal = Number(enrollment.goal_value);
  const pct = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;
  const challenge = await getActiveChallenge();
  const today = todayISO();
  const day = Math.min(100, Math.max(1, Math.floor((new Date(today) - new Date(enrollment.start_date + 'T00:00:00')) / 86400000) + 1));
  const next = await db('milestones')
    .where({ enrollment_id: enrollment.id })
    .whereNull('reached_at')
    .orderBy('threshold', 'asc')
    .first();
  return {
    activity: TYPE_LABEL[enrollment.activity_type] || 'MOVE',
    goal,
    unit: unitFor(enrollment),
    total: fmt(total),
    pct,
    day,
    startDate: enrollment.start_date,
    next: next ? Number(next.threshold) : null,
    remainingToGoal: fmt(Math.max(0, goal - total)),
    remainingToNext: next ? fmt(Math.max(0, Number(next.threshold) - total)) : 0
  };
}

async function handleCallback(cb) {
  if (!cb || !cb.id || !cb.message || !cb.message.chat) return;
  const tgUserId = cb.from && cb.from.id;
  const chatId = cb.message.chat.id;
  const data = String(cb.data || '');
  telegramMessenger.answerCallbackQuery(cb.id).catch(() => {});

  const conn = await connByTg(tgUserId);
  if (!conn || conn.state !== 'active') {
    send(chatId, 'Your Telegram isn\u2019t linked yet.\n\nOpen your dashboard and tap JOIN THE COMMUNITY to get started.', botKeyboard.home());
    return;
  }
  const userId = conn.user_id;
  const enrollment = await enrollmentFor(userId);
  const user = await db('users').where({ id: userId }).first();

  // ── Logging flow ──
  if (data === 'log' || data.startsWith('log_')) {
    return handleLog(chatId, userId, enrollment, user, data);
  }

  switch (data) {
    case 'home':
      return sendHome(chatId, userId, enrollment);
    case 'progress':
      if (!enrollment) return sendHome(chatId, userId, null);
      return sendProgress(chatId, enrollment);
    case 'milestones':
      if (!enrollment) return sendHome(chatId, userId, null);
      return sendMilestones(chatId, enrollment);
    case 'community':
      return sendCommunity(chatId);
    case 'more':
      return sendMore(chatId, userId, enrollment);
    case 'people':
      return sendPeople(chatId, userId, enrollment);
    case 'strava':
      return sendStrava(chatId, userId);
    case 'settings':
    case 'settings:toggle:milestones':
    case 'settings:toggle:weekly':
    case 'settings:toggle:community':
    case 'settings:reminders:never':
    case 'settings:reminders:occasionally':
    case 'settings:reminders:regularly':
      return sendSettings(chatId, userId, data);
    case 'whats_next':
      return send(chatId, botMessages.whatsNext(), botKeyboard.home());
    case 'onboard:see':
      return handleOnboardSee(chatId, userId);
    case 'onboard:strava':
      return send(chatId, botMessages.stravaConnectPrompt(`${config.clientOrigin}/profile?strava=connect`), [
        [{ text: 'CONNECT STRAVA', url: `${config.clientOrigin}/profile?strava=connect` }],
        [{ text: 'LOG MANUALLY', callback_data: 'onboard:manual' }],
        [{ text: '⬅️ HOME', callback_data: 'home' }]
      ]);
    case 'onboard:manual':
      await botState.clearState(userId);
      return send(chatId, botMessages.ready(), botKeyboard.onboardReady(config.telegram.groupLink || config.clientOrigin));
    default:
      return sendHome(chatId, userId, enrollment);
  }
}

// SEE MY 100: if Strava is already connected, skip the "how to record" choice
// and go straight to READY (+ JOIN COMMUNITY). Otherwise ask.
async function handleOnboardSee(chatId, userId) {
  const strava = await db('strava_connections').where({ user_id: userId, status: 'connected' }).first();
  if (strava) {
    await botState.clearState(userId);
    return send(chatId, botMessages.ready(), botKeyboard.onboardReady(config.telegram.groupLink || config.clientOrigin));
  }
  return send(chatId, botMessages.trackingChoice(), botKeyboard.trackingChoice());
}

// ── Command shortcuts (secondary to buttons) ────────
async function command(chatId, userId, cmd) {
  const enrollment = await enrollmentFor(userId);
  switch (cmd) {
    case 'progress':
      return enrollment ? sendProgress(chatId, enrollment) : sendHome(chatId, userId, null);
    case 'log':
      return handleLog(chatId, userId, enrollment, await db('users').where({ id: userId }).first(), 'log');
    case 'milestones':
      return enrollment ? sendMilestones(chatId, enrollment) : sendHome(chatId, userId, null);
    case 'community':
      return sendCommunity(chatId);
    case 'settings':
      return sendSettings(chatId, userId, 'settings');
    case 'home':
      return sendHome(chatId, userId, enrollment);
    default:
      return sendHome(chatId, userId, enrollment);
  }
}

// ── Onboarding after a fresh deep-link connect ──────
async function onboard(chatId, userId, enrollment) {
  const user = await db('users').where({ id: userId }).first();
  const activity = enrollment ? TYPE_LABEL[enrollment.activity_type] || 'MOVE' : 'MOVE';
  const goal = enrollment ? Number(enrollment.goal_value) : 0;
  const unit = enrollment ? unitFor(enrollment) : 'KM';
  await botState.setState(userId, { flow: 'onboard' });
  send(chatId, botMessages.youIn({ activity, goal, unit }), botKeyboard.onboardSee());
}

// ── Screens ─────────────────────────────────────────

async function sendHome(chatId, userId, enrollment) {
  if (!enrollment) {
    send(chatId, botMessages.homeNotStarted({ activity: 'MOVE', goal: 0, unit: 'KM' }), botKeyboard.home());
    return;
  }
  const d = await progressData(enrollment, userId);
  if (enrollment.status === 'completed' || d.pct >= 100) {
    send(chatId, botMessages.homeComplete({ goal: d.goal, unit: d.unit }), botKeyboard.homeComplete());
    return;
  }
  if (d.total <= 0) {
    send(chatId, botMessages.homeNotStarted({ activity: d.activity, goal: d.goal, unit: d.unit }), botKeyboard.home());
    return;
  }
  send(chatId, botMessages.homeActive(d), botKeyboard.home());
}

async function sendProgress(chatId, enrollment) {
  const d = await progressData(enrollment, 0);
  const kb = botKeyboard.progress();
  // dashboard link
  kb[1] = [{ text: '🌐 VIEW FULL DASHBOARD', url: `${config.clientOrigin}/dashboard` }];
  send(chatId, botMessages.progressMsg(d), kb);
}

async function sendMilestones(chatId, enrollment) {
  const rows = await db('milestones')
    .where({ enrollment_id: enrollment.id })
    .orderBy('threshold', 'asc');
  const total = await totalFor(enrollment.id);
  const unit = unitFor(enrollment);
  const reached = rows.filter((m) => m.reached_at);
  const next = rows.find((m) => !m.reached_at);
  const current = Math.max(0, total);
  send(
    chatId,
    botMessages.milestonesMsg({
      rows: rows.map((m) => ({ threshold: Number(m.threshold), unit, reached: !!m.reached_at })),
      current: fmt(current),
      next: next ? Number(next.threshold) : null,
      remainingToNext: next ? fmt(Math.max(0, Number(next.threshold) - current)) : 0
    }),
    botKeyboard.milestones()
  );
}

async function sendCommunity(chatId) {
  const challenge = await getActiveChallenge();
  let members = 0;
  let moved = 0;
  let movingWeek = 0;
  if (challenge) {
    const m = await db('enrollments').where({ challenge_id: challenge.id }).whereIn('status', ['committed', 'active']).countDistinct({ c: 'user_id' }).first();
    members = Number(m.c);
    const ids = await db('enrollments').where({ challenge_id: challenge.id }).whereIn('status', ['committed', 'active']).pluck('id');
    if (ids.length) {
      const r = await db('challenge_activities').whereIn('enrollment_id', ids).sum({ s: 'quantity' }).first();
      moved = fmt(Number(r.s) || 0);
      const weekStart = startOfWeekLocal();
      const w = await db('challenge_activities').whereIn('enrollment_id', ids).where('date', '>=', weekStart).countDistinct({ c: 'enrollment_id' }).first();
      movingWeek = Number(w.c);
    }
  }
  const kb = botKeyboard.community(config.telegram.groupLink || undefined);
  send(chatId, botMessages.communityPulse({ members, moved, unit: 'KM', movingWeek }), kb);
}

function startOfWeekLocal() {
  const today = todayISO();
  const d = new Date(today + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function sendStrava(chatId, userId) {
  const strava = await db('strava_connections').where({ user_id: userId }).first();
  if (strava && strava.status === 'connected') {
    const last = strava.last_synced_at ? new Date(strava.last_synced_at) : null;
    const lastLine = last && !Number.isNaN(last.getTime()) ? `Last synced: ${last.toISOString().slice(0, 10)}` : 'Last synced: —';
    send(chatId, `🟠 STRAVA CONNECTED\n\nYour activities are syncing automatically.\n\n${lastLine}`, botKeyboard.more());
  } else {
    const url = `${config.clientOrigin}/profile?strava=connect`;
    send(chatId, `YOUR ACTIVITIES CAN SYNC AUTOMATICALLY.\n\nConnect Strava and let THE 100 handle your progress.`, [
      [{ text: 'CONNECT STRAVA', url }],
      [{ text: '⬅️ HOME', callback_data: 'home' }]
    ]);
  }
}

function sendMore(chatId, userId, enrollment) {
  const kb = botKeyboard.more();
  kb[3] = [{ text: '🌐 THE 100 WEBSITE', url: config.clientOrigin }];
  send(chatId, 'MORE', kb);
}

async function sendPeople(chatId, userId, enrollment) {
  if (!enrollment) return send(chatId, 'Join the challenge on the website first.', botKeyboard.home());
  const { peers, goal, unit } = await peopleLikeMe({ userId, enrollment });
  const kb = [
    [{ text: 'MEET THEM', url: config.telegram.groupLink || config.clientOrigin }],
    [{ text: '⬅️ HOME', callback_data: 'home' }]
  ];
  send(chatId, botMessages.peopleLikeYou({ peers, goal, unit, activity: enrollment.activity_type || 'MOVING' }), kb);
}

async function sendSettings(chatId, userId, data) {
  const patch = {};
  if (data === 'settings:toggle:milestones') patch.milestones = true;
  if (data === 'settings:toggle:weekly') patch.weekly = true;
  if (data === 'settings:toggle:community') patch.community = true;
  if (data === 'settings:reminders:never') patch.reminders = 'never';
  if (data === 'settings:reminders:occasionally') patch.reminders = 'occasionally';
  if (data === 'settings:reminders:regularly') patch.reminders = 'regularly';

  if (data.startsWith('settings:toggle:')) {
    const cur = await botSettings.getSettings(userId);
    if (data.endsWith('milestones')) patch.milestones = !cur.milestonesOn;
    if (data.endsWith('weekly')) patch.weekly = !cur.weeklyOn;
    if (data.endsWith('community')) patch.community = !cur.communityOn;
  }

  const s = await botSettings.updateSettings(userId, patch);
  const kb = buildSettingsKeyboard(s);
  send(chatId, botMessages.settingsMsg(s), kb);
}

function buildSettingsKeyboard(s) {
  return [
    [
      { text: `MILESTONES ${s.milestonesOn ? 'ON' : 'OFF'}`, callback_data: 'settings:toggle:milestones' },
      { text: `WEEKLY ${s.weeklyOn ? 'ON' : 'OFF'}`, callback_data: 'settings:toggle:weekly' },
      { text: `COMMUNITY ${s.communityOn ? 'ON' : 'OFF'}`, callback_data: 'settings:toggle:community' }
    ],
    [
      { text: `REMINDERS: ${s.remindersMode.toUpperCase()}`, callback_data: 'settings:reminders:cycle' }
    ],
    [{ text: '⬅️ HOME', callback_data: 'home' }]
  ];
}

// ── Logging flow ────────────────────────────────────

async function handleLog(chatId, userId, enrollment, user, data) {
  if (!enrollment) return sendHome(chatId, userId, null);

  const types = logTypesFor(enrollment.activity_type);

  if (data === 'log') {
    await botState.setState(userId, { flow: 'log' });
    send(chatId, botMessages.logAskType(), botKeyboard.logType(types));
    return;
  }
  if (data.startsWith('log_type:')) {
    const type = data.split(':')[1];
    await botState.setState(userId, { flow: 'log', type });
    send(chatId, botMessages.logAskDistance(), botKeyboard.logDistance());
    return;
  }
  if (data.startsWith('log_dist:')) {
    const val = data.split(':')[1];
    const st = (await botState.getState(userId)) || {};
    if (val === 'custom') {
      await botState.setState(userId, { ...st, flow: 'log', expect: 'distance' });
      send(chatId, 'HOW FAR?', undefined);
      telegramMessenger.sendToChat(chatId, 'Type the distance in KM (e.g., 7.2).');
      return;
    }
    await botState.setState(userId, { ...st, distance: Number(val) });
    send(chatId, botMessages.logAskDate(), botKeyboard.logDate());
    return;
  }
  if (data.startsWith('log_date:')) {
    const val = data.split(':')[1];
    const st = (await botState.getState(userId)) || {};
    if (val === 'custom') {
      await botState.setState(userId, { ...st, flow: 'log', expect: 'date' });
      telegramMessenger.sendToChat(chatId, 'Type the date as YYYY-MM-DD.');
      return;
    }
    const date = val === 'yesterday' ? addDaysISO(todayISO(), -1) : todayISO();
    await botState.setState(userId, { ...st, date, when: val });
    send(chatId, 'WHEN?\n\n' + (val === 'yesterday' ? 'YESTERDAY' : 'TODAY'), botKeyboard.logConfirm());
    return;
  }
  if (data === 'log_confirm') {
    const st = await botState.getState(userId);
    if (!st || !st.type || !st.distance || !st.date) {
      await botState.clearState(userId);
      return sendHome(chatId, userId, enrollment);
    }
    const result = await logActivity.logActivity({
      user,
      date: st.date,
      quantity: st.distance,
      activityType: st.type,
      notes: 'via Telegram'
    });
    await botState.clearState(userId);
    if (!result.ok) {
      telegramMessenger.sendToChat(chatId, result.reason === 'out-of-window' ? 'That date is outside the challenge window.' : 'Could not log that activity.');
      return sendHome(chatId, userId, enrollment);
    }
    const total = await totalFor(enrollment.id);
    const goal = Number(enrollment.goal_value);
    const pct = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;
    const next = await db('milestones').where({ enrollment_id: enrollment.id }).whereNull('reached_at').orderBy('threshold', 'asc').first();
    telegramMessenger.sendToChat(
      chatId,
      botMessages.logConfirm({
        activity: TYPE_LABEL[st.type] || st.type.toUpperCase(),
        distance: st.distance,
        unit: unitFor(enrollment),
        when: st.when === 'yesterday' ? 'YESTERDAY' : 'TODAY',
        from: fmt(Number(result.total) - st.distance),
        to: fmt(total),
        pct,
        next: next ? Number(next.threshold) : null,
        remainingToNext: next ? fmt(Math.max(0, Number(next.threshold) - total)) : 0
      }),
      botKeyboard.home()
    );
  }
}

function logTypesFor(activityType) {
  if (activityType === 'run_walk') return [{ key: 'running', label: '🏃 RUN' }, { key: 'walking', label: '🚶 WALK' }];
  const label = TYPE_LABEL[activityType] || 'MOVE';
  return [{ key: activityType, label }];
}

// Text input for custom distance/date during the log flow.
async function handleTextInput(chatId, userId, text) {
  const st = await botState.getState(userId);
  if (!st || st.flow !== 'log' || !st.expect) return false;
  const trimmed = String(text || '').trim();
  if (st.expect === 'distance') {
    const qty = Number(trimmed);
    if (!Number.isFinite(qty) || qty <= 0) {
      telegramMessenger.sendToChat(chatId, 'That doesn\u2019t look like a distance. Type a number in KM (e.g., 7.2).');
      return true;
    }
    await botState.setState(userId, { ...st, distance: qty, expect: null });
    send(chatId, botMessages.logAskDate(), botKeyboard.logDate());
    return true;
  }
  if (st.expect === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      telegramMessenger.sendToChat(chatId, 'Type the date as YYYY-MM-DD.');
      return true;
    }
    await botState.setState(userId, { ...st, date: trimmed, when: trimmed, expect: null });
    send(chatId, 'WHEN?\n\n' + trimmed, botKeyboard.logConfirm());
    return true;
  }
  return false;
}

module.exports = { handleCallback, handleTextInput, command, onboard };