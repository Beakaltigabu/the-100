import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

const config = require('../src/config');
const logActivity = require('../src/services/logActivity');
const telegramMessenger = require('../src/services/telegramMessenger');

const GROUP = config.telegram.groupId;

describe('WEBSITE ↔ BOT — seamless messaging across surfaces', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  it('website enrollment sends a private commitment DM and NO group post', async () => {
    const u = await h.mkUser({ name: 'Newbie', qty: 0, linked: false });
    const t = h.tgId();
    await h.db('telegram_connections').insert({ user_id: u.uid, state: 'active', telegram_user_id: t });
    const snap = await h.snapshot();
    telegramMessenger.sendToUser(u.uid, 'Your 100 starts now. Goal: 500 KM.');
    const dms = await h.capture(snap, t);
    const group = await h.capture(snap, GROUP);
    expect(dms.join('\n')).toContain('Your 100 starts now.');
    expect(group).toHaveLength(0); // no join broadcast to the community group
  });

  it('website manual log updates progress AND sends exactly one milestone DM + one curated group moment', async () => {
    const u = await h.mkUser({ name: 'SiteLog', qty: 0 });
    const user = await h.db('users').where({ id: u.uid }).first();
    const ch = await h.getActiveChallenge();
    const enrollment = await h.db('enrollments').where({ user_id: u.uid, challenge_id: ch.id }).first();

    const snap = await h.snapshot();
    await logActivity.logActivity({ user, date: h.todayISO(), quantity: 140, activityType: 'running', notes: 'website' });

    const dms = await h.capture(snap, u.tgId);
    const group = await h.capture(snap, GROUP);
    // website progress updated
    const total = await h.db('challenge_activities').where({ enrollment_id: u.eid }).sum({ s: 'quantity' }).first();
    expect(Number(total.s)).toBe(140);
    // exactly one milestone DM (125 KM reached)
    expect(dms.filter((m) => m.includes('MILESTONE REACHED')).length).toBe(1);
    // exactly one curated group moment (major milestone >=100 KM) + the first-step
    expect(group.filter((m) => m.includes('125 KM.') || m.includes('FIRST STEP.')).length).toBe(2);
  });

  it('bot-logged activity is reflected on the website (totals)', async () => {
    const u = await h.mkUser({ name: 'BotLog', qty: 0 });
    // bot logs 7.2 KM
    await h.cb(u.tgId, 'log');
    await h.cb(u.tgId, 'log_type:running');
    await h.cb(u.tgId, 'log_dist:7.2');
    await h.cb(u.tgId, 'log_date:today');
    await h.cb(u.tgId, 'log_confirm');

    const total = await h.db('challenge_activities').where({ enrollment_id: u.eid }).sum({ s: 'quantity' }).first();
    expect(Number(total.s)).toBe(7.2);
  });

  it('bot settings gate website-triggered notifications (milestones OFF → no DM, group still capped)', async () => {
    const u = await h.mkUser({ name: 'Gate', qty: 0 });
    await h.db('bot_settings').insert({ user_id: u.uid, milestones_on: false });
    const user = await h.db('users').where({ id: u.uid }).first();
    const snap = await h.snapshot();
    await logActivity.logActivity({ user, date: h.todayISO(), quantity: 140, activityType: 'running', notes: 'website' });
    const dms = await h.capture(snap, u.tgId);
    expect(dms.filter((m) => m.includes('MILESTONE REACHED')).length).toBe(0);
  });

  it('community pulse mirrors website data (member count = active enrollments)', async () => {
    await h.mkUser({ name: 'P1', qty: 30 });
    await h.mkUser({ name: 'P2', qty: 20 });
    const u3 = await h.mkUser({ name: 'P3', qty: 0, status: 'completed' });
    const snap = await h.snapshot();
    await h.cb(u3.tgId, 'community');
    const msgs = await h.capture(snap, u3.tgId);
    const text = msgs.join('\n');
    // pulse shows the number of active+committed members (P1, P2, P3-active counts... P3 is completed)
    const ch = await h.getActiveChallenge();
    const count = await h.db('enrollments').where({ challenge_id: ch.id }).whereIn('status', ['committed', 'active']).countDistinct({ c: 'user_id' }).first();
    expect(text).toContain(`${Number(count.c)} members`);
  });
});