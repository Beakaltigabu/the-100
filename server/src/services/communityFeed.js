const db = require('../db');
const { todayISO } = require('../lib/dates');
const { unitForActivity, UNIT_LABEL } = require('../constants');
const { getActiveChallenge } = require('./challengeWindow');

// Feed tier priority (PRD: meaningful + recent, not purely chronological).
const TIER = { announcement: 0, milestone: 1, finish: 2, join: 3, check_in: 4 };

const PAGE_LIMIT = 15;
const MAX_LIMIT = 40;
// Per-source caps keep the merged pagination correct for this scale.
const SOURCE_CAPS = { announcement: 50, milestone: 120, finish: 60, join: 60, check_in: 120 };

function makeCursor(tier, ts, seq) {
  return `${tier}|${ts}|${seq}`;
}

function parseCursor(cursor) {
  if (!cursor) return null;
  const parts = String(cursor).split('|');
  if (parts.length !== 3) return null;
  const tier = Number(parts[0]);
  if (!Number.isFinite(tier) || TIER_MAP[tier] === undefined) return null;
  const seq = Number(parts[2]);
  if (!Number.isFinite(seq)) return null;
  return { tier, ts: parts[1], seq };
}

const TIER_MAP = Object.keys(TIER).reduce((acc, k) => {
  acc[TIER[k]] = k;
  return acc;
}, {});

function unitLabel(activityType) {
  return UNIT_LABEL[unitForActivity(activityType)] || 'KM';
}

// Use the short-TTL memoized getter — the active challenge barely changes.
const activeChallenge = getActiveChallenge;

// Recent top streaks by day count (used to compute milestone lengths).
async function loadAnnouncements(challengeId) {
  let q = db('community_announcements')
    .where({ status: 'published' })
    .whereNotNull('published_at')
    .orderBy('published_at', 'desc')
    .limit(SOURCE_CAPS.announcement);
  if (challengeId) q = q.where({ challenge_id: challengeId });
  return q;
}

async function loadMilestones(challengeId) {
  let q = db('milestones')
    .join('enrollments', 'enrollments.id', 'milestones.enrollment_id')
    .join('users', 'users.id', 'enrollments.user_id')
    .whereNotNull('milestones.reached_at')
    .select(
      'milestones.id as milestone_id',
      'milestones.enrollment_id',
      'milestones.threshold',
      'milestones.reached_at as ts',
      'enrollments.activity_type',
      'enrollments.goal_value',
      'users.id as actor_id',
      'users.name',
      'users.photo_url',
      'users.social_handle'
    )
    .orderBy('milestones.reached_at', 'desc')
    .limit(SOURCE_CAPS.milestone);
  if (challengeId) q = q.where('enrollments.challenge_id', challengeId);
  const rows = await q;
  if (!rows.length) return rows;

  // Current totals for percent-complete on milestone cards.
  const totals = {};
  const totalsRows = await db('challenge_activities')
    .whereIn('enrollment_id', rows.map((r) => r.enrollment_id))
    .groupBy('enrollment_id')
    .select('enrollment_id')
    .sum({ total: 'quantity' });
  for (const r of totalsRows) totals[r.enrollment_id] = Number(r.total) || 0;
  for (const r of rows) r._total = totals[r.enrollment_id] || 0;
  return rows;
}

async function loadFinishes(challengeId) {
  let q = db('enrollments')
    .join('users', 'users.id', 'enrollments.user_id')
    .whereNotNull('enrollments.completed_at')
    .select(
      'enrollments.id as enrollment_id',
      'enrollments.completed_at as ts',
      'enrollments.activity_type',
      'enrollments.goal_value',
      'users.id as actor_id',
      'users.name',
      'users.photo_url',
      'users.social_handle'
    )
    .orderBy('enrollments.completed_at', 'desc')
    .limit(SOURCE_CAPS.finish);
  if (challengeId) q = q.where('enrollments.challenge_id', challengeId);
  return q;
}

async function loadJoins(challengeId) {
  let q = db('enrollments')
    .join('users', 'users.id', 'enrollments.user_id')
    .select(
      'enrollments.id as enrollment_id',
      'enrollments.created_at as ts',
      'enrollments.activity_type',
      'enrollments.goal_value',
      'users.id as actor_id',
      'users.name',
      'users.photo_url',
      'users.social_handle'
    )
    .orderBy('enrollments.created_at', 'desc')
    .limit(SOURCE_CAPS.join);
  if (challengeId) q = q.where('enrollments.challenge_id', challengeId);
  return q;
}

async function loadCheckIns(challengeId) {
  let q = db('community_posts')
    .join('users', 'users.id', 'community_posts.user_id')
    .where({ 'community_posts.type': 'check_in', 'community_posts.status': 'published' })
    .select(
      'community_posts.id',
      'community_posts.user_id',
      'community_posts.body',
      'community_posts.distance',
      'community_posts.activity_type',
      'community_posts.enrollment_id',
      'community_posts.challenge_id',
      'community_posts.created_at as ts',
      'users.name',
      'users.photo_url',
      'users.social_handle'
    )
    .orderBy('community_posts.created_at', 'desc')
    .limit(SOURCE_CAPS.check_in);
  if (challengeId) q = q.where('community_posts.challenge_id', challengeId);
  return q;
}

function toItem(raw) {
  const actor = {
    id: raw.actor_id != null ? raw.actor_id : raw.user_id,
    name: raw.name,
    avatarUrl: raw.photo_url || null,
    socialHandle: raw.social_handle || null,
    activityType: raw.activity_type || null
  };
  const idMap = {
    announcement: `announcement:${raw.id}`,
    milestone: `milestone:${raw.id}`,
    finish: `finish:${raw.id}`,
    join: `join:${raw.id}`,
    check_in: `check_in:${raw.id}`
  };
  const base = {
    id: idMap[raw.kind],
    createdAt: raw.ts,
    _seq: Number(raw.id),
    actor,
    isMine: !!raw.isMine,
    ...(raw.kind === 'check_in' ? { postId: Number(raw.id) } : {}),
    engagement: { cheers: raw._cheers || 0, cheeredByMe: !!raw._cheered }
  };
  switch (raw.kind) {
    case 'announcement':
      return { ...base, type: 'announcement', challenge: raw.challenge, data: { title: raw.title, body: raw.body, pinned: !!raw.pinned_at } };
    case 'milestone':
      return {
        ...base,
        type: 'milestone',
        challenge: { id: raw.challenge_id || null, name: 'THE 100' },
        data: { threshold: Number(raw.threshold), unit: unitLabel(raw.activity_type), percent: raw._goal > 0 ? Math.min(100, Math.round((raw._total / raw._goal) * 100)) : 0 }
      };
    case 'finish':
      return { ...base, type: 'finish', challenge: { id: raw.challenge_id || null, name: 'THE 100' }, data: { goal: Number(raw.goal_value), unit: unitLabel(raw.activity_type) } };
    case 'join':
      return { ...base, type: 'join', challenge: { id: raw.challenge_id || null, name: 'THE 100' }, data: { goal: Number(raw.goal_value), unit: unitLabel(raw.activity_type) } };
    default:
      return {
        ...base,
        type: 'check_in',
        challenge: raw.challenge_id ? { id: raw.challenge_id, name: 'THE 100' } : null,
        data: { body: raw.body, distance: raw.distance != null ? Number(raw.distance) : null, activityType: raw.activity_type || null, day: raw._day || null }
      };
  }
}

async function buildFeed({ limit = PAGE_LIMIT, cursor, type, challengeId, viewerId }) {
  const pageSize = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const cursorParsed = parseCursor(cursor);
  const challenge = await activeChallenge();
  const cid = challengeId || (challenge && challenge.id) || null;

  // Load sources.
  const [announcements, milestones, finishes, joins, checkIns] = await Promise.all([
    loadAnnouncements(cid),
    loadMilestones(cid),
    loadFinishes(cid),
    loadJoins(cid),
    loadCheckIns(cid)
  ]);

  // Day-of-challenge for check-ins (from their enrollment start date).
  const enrollIds = checkIns.filter((p) => p.enrollment_id).map((p) => p.enrollment_id);
  const dayByEnrollment = {};
  if (enrollIds.length) {
    const ens = await db('enrollments').whereIn('id', enrollIds).select('id', 'start_date');
    for (const en of ens) {
      const start = new Date(en.start_date + 'T00:00:00');
      for (const p of checkIns) {
        if (p.enrollment_id === en.id) {
          const diff = Math.floor((new Date(p.ts) - start) / 86400000);
          dayByEnrollment[en.id] = Math.min(100, Math.max(1, diff + 1));
        }
      }
    }
  }
  checkIns.forEach((p) => {
    p._day = p.enrollment_id ? dayByEnrollment[p.enrollment_id] || null : null;
  });

  const items = [
    ...announcements.map((a) => toItem({ kind: 'announcement', ts: a.published_at, id: a.id, title: a.title, body: a.body, pinned_at: a.pinned_at, challenge_id: a.challenge_id, challenge: a.challenge_id ? { id: a.challenge_id, name: 'THE 100' } : null, name: 'THE 100 HQ' })),
    ...milestones.map((m) => toItem({ kind: 'milestone', ts: m.ts, id: m.milestone_id, actor_id: m.actor_id, name: m.name, photo_url: m.photo_url, activity_type: m.activity_type, threshold: m.threshold, _total: m._total, _goal: Number(m.goal_value) })),
    ...finishes.map((f) => toItem({ kind: 'finish', ts: f.ts, id: f.enrollment_id, actor_id: f.actor_id, name: f.name, photo_url: f.photo_url, activity_type: f.activity_type, goal_value: f.goal_value })),
    ...joins.map((j) => toItem({ kind: 'join', ts: j.ts, id: j.enrollment_id, actor_id: j.actor_id, name: j.name, photo_url: j.photo_url, activity_type: j.activity_type, goal_value: j.goal_value })),
    ...checkIns.map((p) => toItem({ kind: 'check_in', id: p.id, user_id: p.user_id, name: p.name, photo_url: p.photo_url, body: p.body, distance: p.distance, activity_type: p.activity_type, enrollment_id: p.enrollment_id, challenge_id: p.challenge_id, ts: p.ts, _cheers: p._cheers, _cheered: p._cheered, _day: p._day, isMine: p.user_id === viewerId }))
  ];

  // Cheer counts + "cheered by me" for all cheerable items — aggregated in SQL
  // (one GROUP BY + one viewer row lookup) instead of loading every cheer row.
  const cheerKeys = items.filter((i) => i.type !== 'announcement').map((i) => i.id);
  if (cheerKeys.length) {
    const [countRows, mineRows] = await Promise.all([
      db('community_cheers').whereIn('item_key', cheerKeys).groupBy('item_key').select('item_key').count({ c: '*' }),
      db('community_cheers').whereIn('item_key', cheerKeys).where({ user_id: viewerId }).select('item_key')
    ]);
    const counts = {};
    for (const r of countRows) counts[r.item_key] = Number(r.c);
    const mine = new Set(mineRows.map((r) => r.item_key));
    items.forEach((i) => {
      if (i.type === 'announcement') return;
      i.engagement = { cheers: counts[i.id] || 0, cheeredByMe: mine.has(i.id) };
    });
  }

  const view = type && type !== 'all' ? items.filter((i) => i.type === type) : items;

  // Order: tier asc, then newest first (numeric seq breaks ties deterministically).
  const sorted = view.sort((a, b) => {
    const t = TIER[a.type] - TIER[b.type];
    if (t !== 0) return t;
    const d = new Date(b.createdAt) - new Date(a.createdAt);
    if (d !== 0) return d;
    return b._seq - a._seq;
  });

  // Cursor filter. Order is (tier asc, createdAt desc, seq desc), so items AFTER
  // the cursor are older (createdAt < cursor.ts) or equal-time with a lower seq.
  let filtered = sorted;
  if (cursorParsed) {
    filtered = sorted.filter((item) => {
      const tier = TIER[item.type];
      if (tier < cursorParsed.tier) return false;
      if (tier > cursorParsed.tier) return true;
      const d = new Date(item.createdAt).getTime() - new Date(cursorParsed.ts).getTime();
      if (d > 0) return false;
      if (d < 0) return true;
      return item._seq < cursorParsed.seq;
    });
  }

  const page = filtered.slice(0, pageSize);
  const nextCursor =
    filtered.length > pageSize
      ? makeCursor(TIER[page[page.length - 1].type], page[page.length - 1].createdAt, page[page.length - 1]._seq)
      : null;

  return { items: page.map(({ _seq, ...rest }) => rest), nextCursor };
}

module.exports = { buildFeed, PAGE_LIMIT, MAX_LIMIT, makeCursor, parseCursor };