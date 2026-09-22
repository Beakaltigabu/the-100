import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

// This server's codebase is CommonJS, and vitest's vi.mock() does NOT intercept
// real CJS require() calls. Instead we patch Node's require cache BEFORE the
// route modules are loaded — every CJS consumer then receives our fakes.
const require = createRequire(import.meta.url);

function patchModule(relPath, exports) {
  const resolved = require.resolve(relPath);
  require(resolved); // make sure a cache entry exists
  require.cache[resolved].exports = exports;
}

// ── Minimal knex-style DB fake ──────────────────────────────────────────────
// Supports the chains used by requireAuth + the routes under test:
// where(obj), whereIn(col, vals|subquery), join, select, orderBy, limit,
// first, del, update, plus thenable materialization.
function createDbMock(state) {
  function rowsFor(table) {
    if (!state.tables[table]) state.tables[table] = [];
    return state.tables[table];
  }

  function matchesFilters(row, filters) {
    return filters.every((f) => {
      // String comparison mimics MySQL's type coercion ('102' matches 102).
      if (f.type === 'eq') return Object.entries(f.obj).every(([k, v]) => String(row[k]) === String(v));
      if (f.type === 'in') return f.vals.map(String).includes(String(row[f.col]));
      return true;
    });
  }

  function materialize(builder) {
    let rows = rowsFor(builder._table).map((r) => ({ ...r }));
    for (const j of builder._joins) {
      const joinCol = j.left.split('.').pop(); // column on the JOINED table
      const baseCol = j.right.split('.').pop(); // column on the base table
      const joined = rowsFor(j.table);
      rows = rows.flatMap((row) =>
        joined
          .filter((jr) => jr[joinCol] === row[baseCol])
          .map((jr) => {
            const merged = { ...row };
            for (const [k, v] of Object.entries(jr)) merged[`${j.table}.${k}`] = v;
            return merged;
          })
      );
    }
    // Expose base columns with the table prefix (for qualified where/select).
    rows = rows.map((row) => {
      const out = { ...row };
      for (const [k, v] of Object.entries(row)) {
        if (!k.includes('.')) out[`${builder._table}.${k}`] = v;
      }
      return out;
    });
    rows = rows.filter((row) => matchesFilters(row, builder._filters));
    for (const o of [...builder._orders].reverse()) {
      rows.sort((a, b) => {
        const av = a[o.col] ?? a[`${builder._table}.${o.col}`];
        const bv = b[o.col] ?? b[`${builder._table}.${o.col}`];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return o.dir === 'desc' ? -cmp : cmp;
      });
    }
    if (builder._limit != null) rows = rows.slice(0, builder._limit);
    return rows;
  }

  function project(row, select) {
    if (!select) return row;
    if (select.some((c) => c.endsWith('*'))) return row;
    const picked = {};
    for (const c of select) picked[c.split('.').pop()] = row[c];
    return picked;
  }

  function makeBuilder(table) {
    const builder = {
      _table: table,
      _filters: [],
      _joins: [],
      _orders: [],
      _select: null,
      _limit: null,
      where(obj) {
        builder._filters.push({ type: 'eq', obj });
        return builder;
      },
      whereIn(col, vals) {
        if (vals && vals._table) {
          const key = (vals._select && vals._select[0]) || 'id';
          vals = materialize(vals).map((r) => r[key] ?? r[key.split('.').pop()]);
        }
        builder._filters.push({ type: 'in', col, vals });
        return builder;
      },
      join(jTable, leftKey, rightKey) {
        builder._joins.push({ table: jTable, left: leftKey, right: rightKey });
        return builder;
      },
      select(...cols) {
        builder._select = cols;
        return builder;
      },
      orderBy(col, dir = 'asc') {
        builder._orders.push({ col, dir });
        return builder;
      },
      limit(n) {
        builder._limit = n;
        return builder;
      },
      first() {
        const row = materialize(builder)[0];
        return Promise.resolve(row ? project(row, builder._select) : undefined);
      },
      del() {
        const rows = materialize(builder);
        const store = rowsFor(table);
        for (const row of rows) {
          const idx = store.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            state.deleted.push({ table, row: store[idx] });
            store.splice(idx, 1);
          }
        }
        return Promise.resolve(rows.length);
      },
      update(values) {
        const rows = materialize(builder);
        for (const row of rows) {
          const target = rowsFor(table).find((r) => r.id === row.id);
          if (target) Object.assign(target, values);
        }
        return Promise.resolve(rows.length);
      },
      then(onF, onR) {
        return Promise.resolve(materialize(builder).map((r) => project(r, builder._select))).then(onF, onR);
      }
    };
    return builder;
  }

  const db = (table) => makeBuilder(table);
  db.fn = { now: () => new Date() };
  return db;
}

// Delegating fake — per-test state is swapped via globalThis.__dbMock.
const dbShim = (table) => globalThis.__dbMock(table);
dbShim.fn = { now: () => new Date() };

patchModule('../src/db', dbShim);
patchModule('../src/services/strava', {
  configured: () => true,
  authorizeUrl: () => 'https://strava.example',
  deauthorize: async () => {}
});
patchModule('../src/services/stravaSync', {
  getValidAccessToken: async () => null,
  backfillRecent: async () => ({}),
  syncStrava: async () => ({})
});
patchModule('../src/lib/crypto', { decrypt: () => 'plain-token', encrypt: (v) => `enc:${v}`, hmac: () => 'sig' });
patchModule('../src/services/logger', { logRequest() {}, logError() {}, logEvent() {}, queued: () => 0 });
patchModule('../src/middleware/rateLimit', new Proxy({}, { get: () => (req, res, next) => next() }));

// Load AFTER patching so the routes bind to the fakes.
const express = require('express');
const cookieParser = require('cookie-parser');
const { signToken, signSessionToken, verifyToken } = require('../src/middleware/auth');
const stravaRouter = require('../src/routes/integrations/strava');
const activitiesRouter = require('../src/routes/activities');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/integrations/strava', stravaRouter);
  app.use('/api/activities', activitiesRouter);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

let server;
let base;

beforeEach(async () => {
  globalThis.__dbMock = createDbMock({
    tables: {
      users: [
        { id: 1, email: 'a@the100.app', token_version: 0 },
        { id: 2, email: 'b@the100.app', token_version: 0 }
      ],
      challenges: [{ id: 1, is_active: true }],
      enrollments: [
        { id: 10, user_id: 1, challenge_id: 1, status: 'active' },
        { id: 20, user_id: 2, challenge_id: 1, status: 'active' }
      ],
      challenge_activities: [
        { id: 100, enrollment_id: 10, source: 'strava', quantity: 5 },
        { id: 101, enrollment_id: 20, source: 'strava', quantity: 7 },
        { id: 102, enrollment_id: 20, source: 'manual', quantity: 3 }
      ],
      strava_connections: [
        { id: 1, user_id: 1, status: 'connected', encrypted_access_token: 'enc', strava_athlete_id: 42 }
      ]
    },
    deleted: []
  });
  const app = buildApp();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  server.close();
});

function cookieFor(user) {
  return `the100_token=${signSessionToken(user)}`;
}

describe('regression: Strava disconnect scoping (cross-user data wipe)', () => {
  it("deletes ONLY the disconnecting user's Strava activities", async () => {
    const res = await fetch(`${base}/api/integrations/strava/disconnect`, {
      method: 'POST',
      headers: { Cookie: cookieFor({ id: 1, token_version: 0 }) }
    });
    expect(res.status).toBe(200);

    const remaining = await globalThis.__dbMock('challenge_activities');
    const remainingIds = remaining.map((r) => r.id).sort((a, b) => a - b);
    // User 1's strava row (100) is gone; user 2's rows (101 strava, 102 manual) survive.
    expect(remainingIds).toEqual([101, 102]);
  });
});

describe('regression: activity delete ownership (IDOR)', () => {
  it("rejects deleting another user's activity with 404 and keeps the row", async () => {
    const res = await fetch(`${base}/api/activities/102`, {
      method: 'DELETE',
      headers: { Cookie: cookieFor({ id: 1, token_version: 0 }) }
    });
    expect(res.status).toBe(404);

    const row = await globalThis.__dbMock('challenge_activities').where({ id: 102 }).first();
    expect(row).toBeTruthy();
  });

  it('allows the owner to delete their own manual activity', async () => {
    const res = await fetch(`${base}/api/activities/102`, {
      method: 'DELETE',
      headers: { Cookie: cookieFor({ id: 2, token_version: 0 }) }
    });
    expect(res.status).toBe(200);

    const row = await globalThis.__dbMock('challenge_activities').where({ id: 102 }).first();
    expect(row).toBeUndefined();
  });

  it('still refuses deleting non-manual activities even for the owner', async () => {
    const res = await fetch(`${base}/api/activities/101`, {
      method: 'DELETE',
      headers: { Cookie: cookieFor({ id: 2, token_version: 0 }) }
    });
    expect(res.status).toBe(400);
  });
});

describe('regression: session token versioning', () => {
  it("signSessionToken embeds the user's token_version", () => {
    const payload = verifyToken(signSessionToken({ id: 7, token_version: 3 }));
    expect(payload.tv).toBe(3);
  });

  it('rejects a session issued before a token_version bump', async () => {
    const stale = signSessionToken({ id: 1, token_version: 0 });
    const res = await fetch(`${base}/api/activities`, { headers: { Cookie: `the100_token=${stale}` } });
    expect(res.status).toBe(200); // fixture user is at token_version 0

    // Bump the user's version — the same token must now be refused.
    await globalThis.__dbMock('users').where({ id: 1 }).update({ token_version: 1 });
    const res2 = await fetch(`${base}/api/activities`, { headers: { Cookie: `the100_token=${stale}` } });
    expect(res2.status).toBe(401);
  });

  it('OAuth state tokens expire after 10 minutes', () => {
    const state = signToken({ sub: 1, purpose: 'strava_oauth' }, { expiresIn: '10m' });
    const payload = JSON.parse(Buffer.from(state.split('.')[1], 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(600);
  });
});

describe('regression: queue backlog bound', () => {
  it('drops jobs beyond MAX_BACKLOG instead of growing forever', () => {
    delete require.cache[require.resolve('../src/services/queue')];
    const { enqueue, backlog, MAX_BACKLOG } = require('../src/services/queue');
    // Never-resolving job keeps everything stuck in the queue.
    let accepted = 0;
    for (let i = 0; i < MAX_BACKLOG + 50; i += 1) {
      if (enqueue(() => new Promise(() => {}), { maxAttempts: 1 })) accepted += 1;
    }
    // One job may be in-flight (shifted off the backlog, executing) — the
    // backlog itself must never exceed the cap.
    expect(accepted).toBeLessThanOrEqual(MAX_BACKLOG + 1);
    expect(backlog()).toBeLessThanOrEqual(MAX_BACKLOG);
  });
});
