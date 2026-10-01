import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

// CJS require-cache patching (same technique as regression.test.js) so the
// notifications service sees a fake DB.
const require = createRequire(import.meta.url);

function patchModule(relPath, exports) {
  const resolved = require.resolve(relPath);
  require(resolved);
  require.cache[resolved].exports = exports;
}

// Minimal knex-style fake covering the chains used by notifications.js.
function createDbMock(state) {
  const db = (table) => {
    const q = {
      _table: table,
      _where: {},
      _null: null,
      _in: null,
      where(obj) { Object.assign(q._where, obj); return q; },
      whereNull(col) { q._null = col; return q; },
      whereIn(col, vals) { q._in = { col, vals }; return q; },
      orderBy() { return q; },
      limit() { return q; },
      count({ c }) {
        return {
          first: async () => {
            let rows = state.tables[table] || [];
            if (q._null) rows = rows.filter((r) => r[q._null] == null);
            return { [c]: String(rows.length) };
          }
        };
      },
      first: async () => {
        const rows = state.tables[table] || [];
        if (q._null) return rows.find((r) => r[q._null] == null);
        if (q._in) return rows.find((r) => q._in.vals.map(String).includes(String(r[q._in.col])));
        return rows.find((r) => Object.entries(q._where).every(([k, v]) => String(r[k]) === String(v)));
      },
      insert(rows) {
        const arr = Array.isArray(rows) ? rows : [rows];
        for (const r of arr) {
          state.id += 1;
          state.tables[table].push({ id: state.id, ...r });
        }
        const ids = arr.map((_, i) => state.id - (arr.length - 1 - i));
        return Promise.resolve(ids);
      },
      update() { return Promise.resolve(1); },
      del: async () => 1
    };
    return q;
  };
  db.fn = { now: () => 'NOW()' };
  return db;
}

describe('notifications preference logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function load() {
    const state = { tables: { notification_preferences: [], notifications: [] }, id: 0 };
    patchModule('../src/db', createDbMock(state));
    // Force a fresh import so the service re-binds to the new fake DB.
    const svcPath = require.resolve('../src/services/notifications');
    delete require.cache[svcPath];
    const svc = require('../src/services/notifications');
    return { svc, state };
  }

  it('skips web notification when the user disabled that type', async () => {
    const { svc, state } = await load();
    state.tables.notification_preferences.push({ user_id: 7, channel: 'web', type: 'announcement', enabled: false });
    const id = await svc.createNotification({ userId: 7, type: 'announcement', title: 'T', body: 'B' });
    expect(id).toBeNull();
    expect(state.tables.notifications).toHaveLength(0);
  });

  it('creates when enabled (absent row = enabled)', async () => {
    const { svc, state } = await load();
    const id = await svc.createNotification({ userId: 7, type: 'milestone', title: 'T', body: 'B' });
    expect(id).toBe(1);
    expect(state.tables.notifications).toHaveLength(1);
    expect(state.tables.notifications[0].type).toBe('milestone');
  });

  it('force delivers even when the user disabled that type', async () => {
    const { svc, state } = await load();
    state.tables.notification_preferences.push({ user_id: 7, channel: 'web', type: 'nudge', enabled: false });
    const id = await svc.createNotification({ userId: 7, type: 'nudge', title: 'T', body: 'B', force: true });
    expect(id).toBe(1);
    expect(state.tables.notifications).toHaveLength(1);
  });

  it('telegramAllowed honors the telegram channel preference', async () => {
    const { svc, state } = await load();
    expect(await svc.telegramAllowed(7, 'milestone')).toBe(true);
    state.tables.notification_preferences.push({ user_id: 7, channel: 'telegram', type: 'milestone', enabled: false });
    expect(await svc.telegramAllowed(7, 'milestone')).toBe(false);
  });
});