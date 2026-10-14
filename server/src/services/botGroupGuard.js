const config = require('../config');
const telegramMessenger = require('./telegramMessenger');
const { getMeta, setMeta } = require('./meta');
const { logEvent } = require('./logger');

// The bot's community-group role is a restrained CATALYST: at most WEEKLY_CAP
// bot messages per week. This is enforced via the `meta` ledger.
const WEEKLY_CAP = 4;

function currentWeek() {
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function groupLedger() {
  const week = currentWeek();
  const storedWeek = await getMeta('bot_group_week');
  if (storedWeek !== week) {
    await setMeta('bot_group_week', week);
    await setMeta('bot_group_count', '0');
    return { week, count: 0 };
  }
  const count = Number(await getMeta('bot_group_count')) || 0;
  return { week, count };
}

async function canPostToGroup() {
  return (await groupLedger()).count < WEEKLY_CAP;
}

// Group member moments only go out once the challenge is underway (keeps the
// community group clean pre-launch).
async function isGroupLive() {
  if (!config.telegram.groupId) {
    logEvent({ source: 'bot', type: 'group_live_check', message: 'No groupId configured', meta: { live: false } });
    return false;
  }
  const { getActiveChallenge, hasChallengeStarted } = require('./challengeWindow');
  const challenge = await getActiveChallenge();
  const live = hasChallengeStarted(challenge);
  logEvent({ source: 'bot', type: 'group_live_check', message: 'Group live check', meta: { live, challengeId: challenge?.id, challengeStarted: challenge?.start_date } });
  return live;
}

async function noteGroupPost() {
  const { count } = await groupLedger();
  await setMeta('bot_group_count', String(count + 1));
  await setMeta('bot_group_last', new Date().toISOString());
}

// Community group only. The bot NEVER posts to any other chat (HQ is admin-only
// and no bot code references an HQ id). Honors the weekly cap unless forced
// (forced posts are reserved for share/curated member moments).
async function sendToCommunity(text, { force = false } = {}) {
  if (!config.telegram.groupId) {
    logEvent({ source: 'bot', type: 'group_send_skip', message: 'No groupId configured', meta: { force } });
    return { sent: false, reason: 'no-group' };
  }
  const canPost = await canPostToGroup();
  if (!force && !canPost) {
    const { count } = await groupLedger();
    logEvent({ source: 'bot', type: 'group_send_skip', message: 'Weekly cap reached', meta: { count, cap: WEEKLY_CAP, force } });
    return { sent: false, reason: 'weekly-cap' };
  }
  const groupLive = await isGroupLive();
  if (!force && !groupLive) {
    logEvent({ source: 'bot', type: 'group_send_skip', message: 'Group not live (challenge not started)', meta: { force } });
    return { sent: false, reason: 'group-not-live' };
  }
  logEvent({ source: 'bot', type: 'group_send_attempt', message: 'Sending to community group', meta: { force, textLength: text.length } });
  telegramMessenger.sendToGroup(text);
  await setMeta('bot_group_last', new Date().toISOString());
  if (!force) await noteGroupPost();
  logEvent({ source: 'bot', type: 'group_send_ok', message: 'Sent to community group' });
  return { sent: true };
}

module.exports = { sendToCommunity, canPostToGroup, isGroupLive, noteGroupPost, WEEKLY_CAP, currentWeek };