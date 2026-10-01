const db = require('../db');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { getActiveChallenge } = require('./challengeWindow');

// "People like me" — social identification, NOT a leaderboard. Returns members
// chasing the same activity + the same goal (rounded to the nearest 100),
// ordered alphabetically (never by distance). No better/worse labels.
async function peopleLikeMe({ userId, enrollment }) {
  const challenge = await getActiveChallenge();
  if (!challenge || !enrollment) return [];
  const goal = Math.round((Number(enrollment.goal_value) || 0) / 100) * 100;
  const unit = UNIT_LABEL[unitForActivity(enrollment.activity_type)] || 'KM';

  const peers = await db('enrollments')
    .join('users', 'users.id', 'enrollments.user_id')
    .where({
      'enrollments.challenge_id': challenge.id,
      'enrollments.activity_type': enrollment.activity_type
    })
    .whereIn('enrollments.status', ['committed', 'active'])
    .whereNot('enrollments.user_id', userId)
    .select('enrollments.id as enrollment_id', 'enrollments.user_id', 'enrollments.goal_value', 'users.name')
    .orderBy('users.name', 'asc');

  const ids = peers.map((p) => p.enrollment_id);
  const rows = ids.length
    ? await db('challenge_activities')
        .whereIn('enrollment_id', ids)
        .groupBy('enrollment_id')
        .select('enrollment_id')
        .sum({ s: 'quantity' })
    : [];
  const totals = {};
  for (const r of rows) totals[r.enrollment_id] = Number(r.s) || 0;

  return {
    unit,
    goal,
    peers: peers
      .filter((p) => Math.round((Number(p.goal_value) || 0) / 100) * 100 === goal)
      .map((p) => ({
        name: p.name || 'Member',
        total: Math.round(totals[p.enrollment_id] * 100) / 100,
        goal: Number(p.goal_value)
      }))
  };
}

module.exports = { peopleLikeMe };