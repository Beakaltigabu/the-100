import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Set VAPID before any config module is loaded so the push service is "configured".
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

const require = createRequire(import.meta.url);

function patchModule(relPath, exports) {
  const resolved = require.resolve(relPath);
  require(resolved);
  require.cache[resolved].exports = exports;
}

// Tiny thenable query builder: where({...}) resolves to filtered rows; del()
// removes them. Enough for push.js.
function createDbMock(state) {
  const db = (table) => {
    const q = { _table: table, _where: {} };
    const materialize = () =>
      (state.tables[table] || []).filter((r) =>
        Object.entries(q._where).every(([k, v]) => String(r[k]) === String(v))
      );
    q.where = (obj) => {
      Object.assign(q._where, obj);
      return q;
    };
    q.del = async () => {
      const rows = materialize();
      state.tables[table] = (state.tables[table] || []).filter((r) => !rows.includes(r));
      return rows.length;
    };
    q.then = (resolve, reject) => {
      try {
        resolve(materialize());
      } catch (e) {
        reject(e);
      }
    };
    return q;
  };
  return db;
}

describe('push service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function load() {
    const state = { tables: { push_subscriptions: [] } };
    patchModule('../src/db', createDbMock(state));
    const sendNotification = vi.fn().mockResolvedValue({});
    patchModule('web-push', { setVapidDetails: () => {}, sendNotification });
    // Force fresh config + push so env-based VAPID is picked up.
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/services/push')];
    const push = require('../src/services/push');
    return { push, state, sendNotification };
  }

  it('sends to every subscription for the user', async () => {
    const { push, state, sendNotification } = await load();
    state.tables.push_subscriptions.push({ id: 1, user_id: 7, endpoint: 'e1', p256dh: 'x', auth: 'y' });
    state.tables.push_subscriptions.push({ id: 2, user_id: 7, endpoint: 'e2', p256dh: 'x', auth: 'y' });
    state.tables.push_subscriptions.push({ id: 3, user_id: 8, endpoint: 'e3', p256dh: 'x', auth: 'y' });

    const r = await push.sendPush(7, { title: 't', body: 'b' });

    expect(r.sent).toBe(2);
    expect(r.pruned).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    // Only user 7's subscriptions were touched.
    const endpoints = sendNotification.mock.calls.map((c) => c[0].endpoint);
    expect(endpoints).toEqual(['e1', 'e2']);
  });

  it('prunes dead subscriptions (410 Gone)', async () => {
    const { push, state, sendNotification } = await load();
    state.tables.push_subscriptions.push({ id: 1, user_id: 7, endpoint: 'e1', p256dh: 'x', auth: 'y' });
    sendNotification.mockRejectedValue({ statusCode: 410 });

    const r = await push.sendPush(7, { title: 't' });

    expect(r.pruned).toBe(1);
    expect(state.tables.push_subscriptions).toHaveLength(0);
  });

  it('is a silent no-op with no subscriptions', async () => {
    const { push, sendNotification } = await load();
    const r = await push.sendPush(7, { title: 't' });
    expect(r.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});