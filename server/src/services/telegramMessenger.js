const config = require('../config');
const db = require('../db');
const { enqueue } = require('./queue');
const botMessages = require('./botMessages');
const { getActiveChallenge, hasChallengeStarted } = require('./challengeWindow');

function configured() {
  return !!config.telegram.botToken;
}

async function deliver(chatId, text, markup) {
  try {
    const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (markup) payload.reply_markup = markup;
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Telegram sendMessage failed:', res.status, body.slice(0, 200));
    }
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

// Language of a member (for bilingual bot messages).
async function getUserLanguage(userId) {
  const user = await db('users').where({ id: userId }).first();
  return (user && user.language) || 'en';
}

// Send a DM to a linked member (fire-and-forget).
function sendToUser(userId, text) {
  if (!configured()) return;
  enqueue(async () => {
    const conn = await db('telegram_connections').where({ user_id: userId, state: 'active' }).first();
    if (conn && conn.telegram_user_id) {
      await deliver(conn.telegram_user_id, text);
    }
  });
}

// Post to the brand's group/channel (no-op until TELEGRAM_GROUP_ID is set).
function sendToGroup(text) {
  if (!configured() || !config.telegram.groupId) return;
  enqueue(() => deliver(config.telegram.groupId, text));
}

// Reply to a specific chat (used by the webhook handler).
function sendToChat(chatId, text, markup) {
  if (!configured()) return;
  enqueue(() => deliver(chatId, text, markup));
}

// Inline "JOIN THE COMMUNITY" button pointing at the private community group.
function joinCommunityMarkup(lang) {
  const url = config.telegram.groupLink;
  if (!url) return undefined;
  return {
    inline_keyboard: [[{ text: lang === 'am' ? 'ማህበረሰቡን ይቀላቀሉ' : 'JOIN THE COMMUNITY', url }]]
  };
}

// Approve a pending chat join request (requires the bot to be admin).
async function approveJoinRequest(chatId, userId) {
  try {
    await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/approveChatJoinRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    return true;
  } catch (err) {
    console.error('Telegram approve error:', err.message);
    return false;
  }
}

// Group broadcasts only go out once the challenge has started (keeps the group clean pre-launch).
async function groupLive() {
  if (!configured() || !config.telegram.groupId) return false;
  const challenge = await getActiveChallenge();
  return hasChallengeStarted(challenge);
}

async function broadcastMilestone(name, threshold, unit) {
  if (await groupLive()) sendToGroup(botMessages.groupMilestone(name, threshold, unit));
}

async function broadcastFinish(name, goal, unit) {
  if (await groupLive()) sendToGroup(botMessages.groupFinish(name, goal, unit));
}

async function broadcastJoin(name) {
  if (await groupLive()) sendToGroup(botMessages.groupJoin(name));
}

async function broadcastDigest(checked, milestones, finishers) {
  if (await groupLive()) sendToGroup(botMessages.groupDigest(checked, milestones, finishers));
}

module.exports = {
  sendToUser,
  sendToGroup,
  sendToChat,
  getUserLanguage,
  joinCommunityMarkup,
  approveJoinRequest,
  broadcastMilestone,
  broadcastFinish,
  broadcastJoin,
  broadcastDigest
};