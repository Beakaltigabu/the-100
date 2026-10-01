const db = require('../db');

// Award a badge idempotently (no-op if already earned). Returns true when newly
// awarded.
async function awardBadge(userId, code) {
  const badge = await db('badges').where({ code }).first();
  if (!badge) return false;
  const existing = await db('user_badges').where({ user_id: userId, badge_id: badge.id }).first();
  if (existing) return false;
  await db('user_badges').insert({ user_id: userId, badge_id: badge.id });
  return true;
}

async function listBadgesForUser(userId) {
  return db('user_badges')
    .join('badges', 'badges.id', 'user_badges.badge_id')
    .where({ 'user_badges.user_id': userId })
    .select('badges.code', 'badges.name', 'badges.icon', 'badges.description', 'user_badges.earned_at')
    .orderBy('user_badges.earned_at', 'asc');
}

module.exports = { awardBadge, listBadgesForUser };