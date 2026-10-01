import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

const { alertAdmins } = require('../src/services/adminAlerts');

describe('ADMIN ALERTS — bot DMs the admin on major events', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  it('DMs the linked admin account on a system alert', async () => {
    // admin account + active Telegram link (mirrors prod: user 103 -> tg 1235169163)
    const [uid] = await h.db('users').insert({
      name: 'Beakal',
      email: 'alert_admin@t.com',
      password_hash: 'x',
      language: 'en',
      onboarding_complete: true
    });
    await h.db('admins').insert({ user_id: uid });
    await h.db('telegram_connections').insert({ user_id: uid, state: 'active', telegram_user_id: 777000001 });

    const snap = await h.snapshot();
    const res = await alertAdmins('TEST admin alert', { category: 'boot', force: true });
    expect(res.sent).toBe(true);
    const msgs = await h.capture(snap, 777000001);
    expect(msgs.join('\n')).toContain('ADMIN ALERT');
    expect(msgs.join('\n')).toContain('TEST admin alert');
  });

  it('respects the per-category cooldown (no spam)', async () => {
    const [uid] = await h.db('users').insert({
      name: 'Beakal',
      email: 'alert_admin2@t.com',
      password_hash: 'x',
      language: 'en',
      onboarding_complete: true
    });
    await h.db('admins').insert({ user_id: uid });
    await h.db('telegram_connections').insert({ user_id: uid, state: 'active', telegram_user_id: 777000002 });

    await alertAdmins('first', { category: 'testcat' });
    const second = await alertAdmins('second', { category: 'testcat' });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('cooldown');
  });

  it('sends the daily digest once per day with real stats', async () => {
    const [uid] = await h.db('users').insert({
      name: 'Beakal',
      email: 'digest_admin@t.com',
      password_hash: 'x',
      language: 'en',
      onboarding_complete: true
    });
    await h.db('admins').insert({ user_id: uid });
    await h.db('telegram_connections').insert({ user_id: uid, state: 'active', telegram_user_id: 777000003 });
    await h.db('meta').where('meta_key', 'admin_digest_day').del(); // fresh day gate
    // a member + activity so the digest has real numbers
    const m = await h.mkUser({ name: 'DigestMember', qty: 12.5 });

    const snap = await h.snapshot();
    const first = await h.scheduler.sendAdminDigest();
    expect(first.ran).toBe(true);
    const second = await h.scheduler.sendAdminDigest();
    expect(second.reason).toBe('already-sent');

    const msgs = await h.capture(snap, 777000003);
    const text = msgs.join('\n');
    expect(text).toContain('DAILY DIGEST');
    expect(text).toMatch(/DAY \d+ \/ 100/);
    expect(text).toContain('MEMBERS');
    expect(text).toContain('STRAVA');
  });
});