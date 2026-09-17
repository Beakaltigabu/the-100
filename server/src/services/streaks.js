const db = require('../db');
const { todayISO, addDaysISO } = require('../lib/dates');
const { getActiveChallenge } = require('./challengeWindow');

// Current consecutive-day check-in streaks, from THE 100's own activity records.
async function computeStreaks(limit = 8) {
  const enrollments = await db('enrollments').whereIn('status', ['committed', 'active']).select('id', 'user_id');
  if (!enrollments.length) return [];

  // A streak can be at most the challenge length (100 days), so only scan the
  // window [start_date, today] instead of every activity ever logged.
  const today = todayISO();
  const challenge = await getActiveChallenge();
  const since = challenge ? challenge.start_date : null;

  let query = db('challenge_activities')
    .whereIn(
      'enrollment_id',
      enrollments.map((e) => e.id)
    )
    .where('date', '<=', today)
    .select('enrollment_id', 'date')
    .distinct();
  if (since) query = query.where('date', '>=', since);
  const rows = await query;

  const byEnrollment = {};
  for (const r of rows) {
    (byEnrollment[r.enrollment_id] = byEnrollment[r.enrollment_id] || new Set()).add(r.date);
  }

  const streaks = [];
  for (const e of enrollments) {
    const dates = byEnrollment[e.id];
    if (!dates) continue;
    let cursor = today;
    let count = 0;
    while (dates.has(cursor)) {
      count += 1;
      cursor = addDaysISO(cursor, -1);
    }
    if (count >= 2) {
      streaks.push({ user_id: e.user_id, days: count });
    }
  }

  streaks.sort((a, b) => b.days - a.days);
  const top = streaks.slice(0, limit);
  const users = await db('users').whereIn(
    'id',
    top.map((s) => s.user_id)
  );
  const nameById = {};
  for (const u of users) nameById[u.id] = u.name;
  return top.map((s) => ({ name: nameById[s.user_id] || 'Member', days: s.days }));
}

module.exports = { computeStreaks };