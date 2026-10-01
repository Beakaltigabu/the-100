// Bot integration-test harness. Import AFTER db-test so env is set.
const db = require('../../src/db');
const { flush } = require('../../src/services/logger');
const { todayISO, addDaysISO } = require('../../src/lib/dates');
const { hashToken } = require('../../src/lib/tokens');
const handlers = require('../../src/routes/webhooks/telegram');
const botRouter = require('../../src/services/botRouter');
const scheduler = require('../../src/services/scheduler');
const { syncMilestones } = require('../../src/services/milestones');
const { getActiveChallenge, clearActiveChallengeCache } = require('../../src/services/challengeWindow');

let _tg = 900000000;

function tgId() {
  _tg += 1;
  return _tg;
}

// Create a member + enrollment (goal-adaptive milestones) + Telegram link + optional Strava.
async function mkUser({ name, email, activity = 'running', goal = 500, status = 'active', qty = 0, strava = false, linked = true, milestones = true } = {}) {
  const em = email || `it_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@t.com`;
  const [uid] = await db('users').insert({ name, email: em, password_hash: 'x', language: 'en', onboarding_complete: true });
  const ch = await getActiveChallenge();
  const [eid] = await db('enrollments').insert({
    user_id: uid,
    challenge_id: ch.id,
    activity_type: activity,
    goal_value: goal,
    status,
    start_date: ch.start_date,
    end_date: ch.end_date
  });
  if (milestones) {
    const thresholds = [...new Set([25, 50, 75, 100].map((p) => Math.round((goal * p) / 100)))].filter((t) => t > 0);
    await db('milestones').insert(thresholds.map((t) => ({ enrollment_id: eid, threshold: t })));
  }
  if (qty) {
    await db('challenge_activities').insert({ enrollment_id: eid, date: todayISO(), quantity: qty, activity_type: activity, source: 'manual' });
    await syncMilestones(eid, qty);
  }
  if (strava) {
    await db('strava_connections').insert({
      user_id: uid,
      status: 'connected',
      connected_at: new Date(),
      last_synced_at: new Date(),
      encrypted_access_token: 'x',
      encrypted_refresh_token: 'x',
      token_expires_at: new Date(Date.now() + 3600000)
    });
  }
  const t = linked ? tgId() : null;
  if (linked) await db('telegram_connections').insert({ user_id: uid, state: 'active', telegram_user_id: t });
  return { uid, eid, tgId: t, email: em };
}

// Create a deep-link invite (state invite_generated) for the onboarding flow.
async function mkInvite(userId, token = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) {
  await db('telegram_connections').insert({
    user_id: userId,
    state: 'invite_generated',
    link_token_hash: hashToken(token),
    link_expires_at: new Date(Date.now() + 600000)
  });
  return token;
}

// ── Drive the real webhook / router ─────────────────
const tgMessage = (msg) => handlers.handleMessage(msg);
const cb = (tgUserId, data) =>
  botRouter.handleCallback({ id: `cb_${Math.random()}`, from: { id: tgUserId }, message: { chat: { id: tgUserId }, message_id: 1 }, data });
const command = (chatId, userId, cmd) => botRouter.command(chatId, userId, cmd);
const onboard = (chatId, userId, enrollment) => botRouter.onboard(chatId, userId, enrollment);
const joinReq = (chatId, tgUserId, firstName) =>
  handlers.handleJoinRequest({ chat: { id: chatId }, from: { id: tgUserId, first_name: firstName } });
const newMembers = (chatId, members) => handlers.handleNewMembers({ chat: { id: chatId }, new_chat_members: members });

// ── Capture outbound dry-run messages ────────────────
let seq = 0;
async function snapshot() {
  seq += 1;
  const r = await db('event_logs').where({ source: 'bot', type: 'send_dry_run' }).orderBy('id', 'desc').first();
  return { id: r ? r.id : 0, tag: seq };
}

async function drain() {
  await new Promise((r) => setTimeout(r, 100));
  await flush();
  await new Promise((r) => setTimeout(r, 30));
}

// Returns texts sent since `snap`. chatId undefined = all chats. A trailing
// ` [kb]` marker means the message carried inline buttons.
async function capture(snap, chatId) {
  await drain();
  let q = db('event_logs').where({ source: 'bot', type: 'send_dry_run' }).where('id', '>', snap.id);
  if (chatId !== undefined) q = q.where('message', 'like', `%to ${chatId}%`);
  const rows = await q.orderBy('id', 'asc');
  return rows.map((r) => r.message.replace(/^\[dry-run\] to [-0-9]+( \[kb\])?: /, ''));
}

// Returns { text, kb } for each message since `snap`.
async function captureDetailed(snap, chatId) {
  await drain();
  let q = db('event_logs').where({ source: 'bot', type: 'send_dry_run' }).where('id', '>', snap.id);
  if (chatId !== undefined) q = q.where('message', 'like', `%to ${chatId}%`);
  const rows = await q.orderBy('id', 'asc');
  return rows.map((r) => {
    const m = r.message.replace(/^\[dry-run\] to [-0-9]+/, '');
    const kb = m.startsWith(' [kb]');
    return { kb, text: m.replace(/^\s*\[kb\]\s*:\s*/, '') };
  });
}

// ── Scheduler helpers ────────────────────────────────
// Temporarily move the challenge start so `day` is the challenge day. Returns a restore fn.
async function forceDay(day) {
  const ch = await getActiveChallenge();
  const orig = ch.start_date;
  await db('challenges').where({ id: ch.id }).update({ start_date: addDaysISO(todayISO(), -(day - 1)) });
  clearActiveChallengeCache();
  return async () => {
    await db('challenges').where({ id: ch.id }).update({ start_date: orig });
    clearActiveChallengeCache();
  };
}

async function runSchedulerJobs() {
  await scheduler.runScheduledJobs();
}

const challenge = () => getActiveChallenge();

module.exports = {
  db,
  tgId,
  todayISO,
  mkUser,
  mkInvite,
  tgMessage,
  cb,
  command,
  onboard,
  joinReq,
  newMembers,
  snapshot,
  drain,
  capture,
  captureDetailed,
  forceDay,
  runSchedulerJobs,
  challenge,
  handlers,
  botRouter,
  scheduler,
  getActiveChallenge,
  hashToken
};