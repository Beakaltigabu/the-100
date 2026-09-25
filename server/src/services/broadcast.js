const db = require('../db');
const { createNotification } = require('./notifications');
const telegramMessenger = require('./telegramMessenger');
const { getActiveChallenge } = require('./challengeWindow');

// ── Targeting ──────────────────────────────────────────

// Synchronous query builder for a targeting spec. Always returns a builder
// (never a raw array), so callers can chain .where/.count/.first safely.
//   { mode: 'all' | 'individual' | 'segment', filters?: {...}, userIds?: [...] }
// segment filters: language ('en'|'am'), activityType, enrolled (bool),
//   status ('committed'|'active'|'completed'|'abandoned'), active (bool, last 7d).
function targetsQuery(targeting, challengeId = 0) {
  const t = (targeting && typeof targeting === 'object') ? targeting : { mode: 'all' };
  const q = db('users')
    .leftJoin('telegram_connections', function () {
      this.on('telegram_connections.user_id', 'users.id').andOn(
        'telegram_connections.state',
        db.raw('?', ['active'])
      );
    })
    .select('users.id', 'users.language', 'telegram_connections.telegram_user_id');

  if (t.mode === 'individual') {
    const ids = (Array.isArray(t.userIds) ? t.userIds : []).map(Number).filter((n) => Number.isInteger(n));
    if (!ids.length) return q.where('users.id', -1);
    return q.whereIn('users.id', ids);
  }

  if (t.mode === 'segment') {
    const f = t.filters || {};
    if (f.language === 'en' || f.language === 'am') q.where('users.language', f.language);
    if (f.activityType) q.where('users.activity_type', f.activityType);

    if (f.enrolled != null) {
      const sub = db('enrollments').whereRaw('enrollments.user_id = users.id').where('enrollments.challenge_id', challengeId);
      f.enrolled ? q.whereExists(sub) : q.whereNotExists(sub);
    }
    if (f.status) {
      q.whereExists(
        db('enrollments')
          .whereRaw('enrollments.user_id = users.id')
          .where('enrollments.challenge_id', challengeId)
          .where('enrollments.status', f.status)
      );
    }
    if (f.active != null) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sub = db('enrollments')
        .join('challenge_activities', 'challenge_activities.enrollment_id', 'enrollments.id')
        .whereRaw('enrollments.user_id = users.id')
        .where('challenge_activities.date', '>=', since);
      f.active ? q.whereExists(sub) : q.whereNotExists(sub);
    }
  }
  // mode 'all' or no filters → everyone
  return q;
}

// Await the resolved recipient rows (id, language, telegram_user_id).
async function resolveTargets(targeting) {
  const challenge = await getActiveChallenge();
  return targetsQuery(targeting, challenge ? challenge.id : 0);
}

// Count of matching recipients for an audience estimate.
async function countTargets(targeting) {
  const challenge = await getActiveChallenge();
  const row = await targetsQuery(targeting, challenge ? challenge.id : 0)
    .clearSelect()
    .count({ c: '*' })
    .first();
  return Number(row.c);
}

function localized(title, body, titleAm, bodyAm, language) {
  const am = language === 'am';
  return { title: am && titleAm ? titleAm : title, body: am && bodyAm ? bodyAm : body };
}

// Uppercase, human-readable type label (product_update → PRODUCT UPDATE).
function typeLabel(type) {
  return String(type || 'announcement').replace(/_/g, ' ').toUpperCase();
}

// Telegram sends parse_mode=HTML, so escape admin-provided text.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Single-language DM: type label + bold title + body + date.
function formatDmMessage({ type, title, body }) {
  const label = typeLabel(type);
  const date = formatDate(new Date());
  return `<b>${escapeHtml(label)}</b>\n\n<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}${date ? `\n\n<i>${date}</i>` : ''}`;
}

// Group post (bilingual): EN block + optional Amharic block + date.
function formatGroupMessage({ type, title, body, titleAm, bodyAm }) {
  const label = typeLabel(type);
  const date = formatDate(new Date());
  const en = `<b>${escapeHtml(label)}</b>\n\n<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
  const am = titleAm ? `\n\n———\n\n<b>${escapeHtml(titleAm)}</b>\n\n${escapeHtml(bodyAm || '')}` : '';
  return `${en}${am}${date ? `\n\n<i>${date}</i>` : ''}`;
}

// ── Delivery ───────────────────────────────────────────

async function dispatch(id, { title, body, titleAm, bodyAm, type, channels, targeting }) {
  const ch = {
    inapp: channels.includes('inapp'),
    telegram: channels.includes('telegram'),
    group: channels.includes('group')
  };
  const targets = await resolveTargets(targeting);
  const counts = { inapp: 0, telegram: 0, group: false };

  // In-app notifications (batch).
  if (ch.inapp && targets.length) {
    const now = db.fn.now();
    const rows = targets.map((u) => {
      const m = localized(title, body, titleAm, bodyAm, u.language);
      return {
        user_id: u.id,
        type: type || 'announcement',
        title: String(m.title).slice(0, 120),
        body: String(m.body).slice(0, 2000),
        channel: 'web',
        sent_at: now
      };
    });
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db('notifications').insert(rows.slice(i, i + CHUNK));
    }
    counts.inapp = rows.length;
  }

  // Telegram DMs (fire-and-forget via the retrying queue).
  if (ch.telegram) {
    for (const u of targets) {
      if (!u.telegram_user_id) continue;
      const m = localized(title, body, titleAm, bodyAm, u.language);
      telegramMessenger.sendToUser(u.id, formatDmMessage({ type, title: m.title, body: m.body }));
      counts.telegram += 1;
    }
  }

  // Group post.
  if (ch.group) {
    telegramMessenger.sendToGroup(formatGroupMessage({ type, title, body, titleAm, bodyAm }));
    counts.group = true;
  }

  // Record recipients for in-app + telegram (bounded batch).
  const recipientRows = [];
  if (ch.inapp) for (const u of targets) recipientRows.push({ broadcast_id: id, user_id: u.id, channel: 'inapp', status: 'sent' });
  if (ch.telegram) for (const u of targets) if (u.telegram_user_id) recipientRows.push({ broadcast_id: id, user_id: u.id, channel: 'telegram', status: 'sent' });
  if (recipientRows.length) {
    const CHUNK = 500;
    for (let i = 0; i < recipientRows.length; i += CHUNK) {
      await db('broadcast_recipients').insert(recipientRows.slice(i, i + CHUNK));
    }
  }

  // Persist the delivery summary on the broadcast row (surfaced in the list).
  await db('broadcasts').where({ id }).update({
    group_sent: counts.group ? 1 : 0,
    recipient_count: counts.inapp,
    telegram_count: counts.telegram
  });

  return counts;
}

// ── Lifecycle operations ───────────────────────────────

// Another live broadcast (excluding the given id), if any.
async function otherLive(excludeId) {
  const q = db('broadcasts').where({ status: 'live' }).whereNull('deleted_at');
  if (excludeId != null) q.whereNot({ id: excludeId });
  return q.first();
}

async function createBroadcast({ adminId, type, title, body, titleAm, bodyAm, channels, targeting, placement, priority, scheduleAt, draft = false, endPrevious = false }) {
  const status = draft ? 'draft' : scheduleAt ? 'scheduled' : 'live';

  // Publishing now while another broadcast is live → report the conflict unless
  // the admin chose to end the previous one.
  if (status === 'live') {
    const other = await otherLive(null);
    if (other && !endPrevious) return { conflict: { id: other.id, title: other.title } };
  }

  const [id] = await db('broadcasts').insert({
    admin_user_id: adminId,
    type: type || 'announcement',
    title: String(title).slice(0, 160),
    body: String(body).slice(0, 5000),
    title_am: titleAm ? String(titleAm).slice(0, 160) : null,
    body_am: bodyAm ? String(bodyAm).slice(0, 5000) : null,
    channels: channels.join(','),
    target: (targeting && targeting.mode) || 'all',
    targeting: targeting ? JSON.stringify(targeting) : null,
    placement: placement || 'app',
    priority: Number(priority) || 0,
    status,
    scheduled_at: scheduleAt || null,
    published_at: scheduleAt ? null : db.fn.now()
  });

  if (status === 'live') {
    if (endPrevious) {
      await db('broadcasts').where({ status: 'live' }).whereNot({ id }).update({
        status: 'ended',
        ended_at: db.fn.now(),
        updated_at: db.fn.now()
      });
    }
    await dispatch(id, { title, body, titleAm, bodyAm, type, channels, targeting });
  }
  return { id };
}

async function updateBroadcast(id, patch) {
  const current = await db('broadcasts').where({ id }).whereNull('deleted_at').first();
  if (!current) return null;
  if (!['draft', 'live'].includes(current.status)) return 'locked';

  const fields = {};
  const allowed = ['type', 'title', 'body', 'title_am', 'body_am', 'channels', 'placement', 'priority', 'targeting'];
  for (const k of allowed) {
    if (patch[k] !== undefined) fields[k] = patch[k];
  }
  if (Array.isArray(fields.channels)) fields.channels = fields.channels.join(',');
  if (fields.targeting) {
    fields.targeting = JSON.stringify(fields.targeting);
    const parsed = safeParse(fields.targeting);
    fields.target = parsed.mode || 'all';
  }
  if (Object.keys(fields).length) {
    await db('broadcasts').where({ id }).update({ ...fields, updated_at: db.fn.now() });
  }

  const fresh = await db('broadcasts').where({ id }).first();

  // Live edits propagate: re-dispatch to the (possibly new) audience.
  if (current.status === 'live') {
    await dispatch(id, {
      title: fresh.title,
      body: fresh.body,
      titleAm: fresh.title_am,
      bodyAm: fresh.body_am,
      type: fresh.type,
      channels: (fresh.channels || '').split(',').filter(Boolean),
      targeting: safeParse(fresh.targeting)
    });
  }
  return fresh;
}

async function publishBroadcast(id, { endPrevious = false } = {}) {
  const current = await db('broadcasts').where({ id }).whereNull('deleted_at').first();
  if (!current) return null;
  if (!['draft', 'scheduled'].includes(current.status)) return 'locked';

  const other = await otherLive(id);
  if (other && !endPrevious) {
    return { conflict: { id: other.id, title: other.title } };
  }
  if (other && endPrevious) {
    await db('broadcasts').where({ id: other.id }).update({
      status: 'ended',
      ended_at: db.fn.now(),
      updated_at: db.fn.now()
    });
  }

  await db('broadcasts').where({ id }).update({
    status: 'live',
    published_at: db.fn.now(),
    scheduled_at: null,
    updated_at: db.fn.now()
  });
  const fresh = await db('broadcasts').where({ id }).first();
  await dispatch(id, {
    title: fresh.title,
    body: fresh.body,
    titleAm: fresh.title_am,
    bodyAm: fresh.body_am,
    type: fresh.type,
    channels: (fresh.channels || '').split(',').filter(Boolean),
    targeting: safeParse(fresh.targeting)
  });
  return fresh;
}

async function endBroadcast(id) {
  const updated = await db('broadcasts').where({ id }).where({ status: 'live' }).update({
    status: 'ended',
    ended_at: db.fn.now(),
    updated_at: db.fn.now()
  });
  return updated ? db('broadcasts').where({ id }).first() : null;
}

async function softDeleteBroadcast(id) {
  const updated = await db('broadcasts').where({ id }).whereNull('deleted_at').update({
    deleted_at: db.fn.now(),
    updated_at: db.fn.now()
  });
  return updated > 0;
}

// ── Queries ────────────────────────────────────────────

async function listBroadcasts({ status, limit = 50 } = {}) {
  const q = db('broadcasts')
    .leftJoin('users', 'users.id', 'broadcasts.admin_user_id')
    .whereNull('broadcasts.deleted_at')
    .select('broadcasts.*', 'users.name as admin_name')
    .orderBy('broadcasts.id', 'desc')
    .limit(Math.min(200, Math.max(1, limit)));
  if (status) q.where('broadcasts.status', status);
  return q;
}

// Highest-priority live broadcast the caller should see, filtered by placement.
// placement is resolved from auth: guest → 'landing', authed → 'app'. Admins see
// the banner regardless of segment/individual targeting (so they can preview).
async function getActiveBroadcastFor({ userId = null, placement = 'landing', isAdmin = false }) {
  const challenge = await getActiveChallenge();
  const cid = challenge ? challenge.id : 0;
  const q = db('broadcasts')
    .where({ status: 'live' })
    .whereNull('deleted_at')
    .whereIn('placement', [placement, 'both'])
    .orderBy('priority', 'desc')
    .orderBy('id', 'desc');

  const rows = await q.limit(10);
  if (!rows.length) return null;

  // Apply per-user targeting in JS (bounded set of live broadcasts).
  for (const b of rows) {
    // The in-app banner only exists for broadcasts with the "inapp" channel.
    const channels = (b.channels || '').split(',').filter(Boolean);
    if (!channels.includes('inapp')) continue;

    // Admins see any live banner regardless of targeting.
    if (isAdmin) return serializeBroadcast(b);

    const targeting = b.targeting ? safeParse(b.targeting) : { mode: 'all' };
    if (!userId) {
      // Guests only see broadcasts aimed at everyone (or the landing audience).
      if (targeting.mode === 'all') return serializeBroadcast(b);
      continue;
    }
    if (targeting.mode === 'all') return serializeBroadcast(b);
    if (targeting.mode === 'individual' && (targeting.userIds || []).includes(Number(userId))) return serializeBroadcast(b);
    if (targeting.mode === 'segment') {
      const match = await targetsQuery(targeting, cid).where('users.id', userId).first();
      if (match) return serializeBroadcast(b);
    }
  }
  return null;
}

function safeParse(s) {
  if (s == null) return { mode: 'all' };
  if (typeof s === 'object') return s; // mysql2 already parsed the JSON column
  try { return JSON.parse(s); } catch { return { mode: 'all' }; }
}

function serializeBroadcast(b) {
  return {
    id: b.id,
    type: b.type,
    title: b.title,
    body: b.body,
    title_am: b.title_am,
    body_am: b.body_am,
    placement: b.placement,
    priority: Number(b.priority) || 0,
    publishedAt: b.published_at
  };
}

// Publish due scheduled broadcasts (called by the scheduler).
async function publishDueScheduled() {
  const rows = await db('broadcasts')
    .where({ status: 'scheduled' })
    .whereNull('deleted_at')
    .where('scheduled_at', '<=', new Date());
  for (const b of rows) {
    // Automated publishing has no admin to confirm — end any current live one.
    await publishBroadcast(b.id, { endPrevious: true });
  }
  return rows.length;
}

module.exports = {
  resolveTargets,
  countTargets,
  createBroadcast,
  updateBroadcast,
  publishBroadcast,
  endBroadcast,
  softDeleteBroadcast,
  listBroadcasts,
  getActiveBroadcastFor,
  publishDueScheduled
};
