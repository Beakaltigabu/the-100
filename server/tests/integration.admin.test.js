import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

const config = require('../src/config');
const { createNotification } = require('../src/services/notifications');
const telegramMessenger = require('../src/services/telegramMessenger');

const GROUP = config.telegram.groupId;

describe('ADMIN → BOT — admin-triggered messaging flows through the real paths', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  it('admin nudge delivers a private bot DM + in-app notification', async () => {
    const u = await h.mkUser({ name: 'Nudged', qty: 30 });
    const snap = await h.snapshot();
    // mirrors POST /api/admin/members/:id/nudge
    await createNotification({
      userId: u.uid,
      type: 'nudge',
      title: 'A nudge from the team',
      body: 'You are doing great.'
    });
    telegramMessenger.sendToUser(u.uid, 'A nudge from the team\n\nYou are doing great.');
    const dms = await h.capture(snap, u.tgId);
    expect(dms.filter((m) => m.includes('A nudge from the team')).length).toBe(1);
    const notif = await h.db('notifications').where({ user_id: u.uid, type: 'nudge' }).first();
    expect(notif).toBeTruthy();
  });

  it('admin run-jobs drives challenge-day DM + group challenge moment + collective distance through real paths', async () => {
    const u = await h.mkUser({ name: 'JobMember', qty: 0 });
    await h.db('challenge_activities').insert({ enrollment_id: u.eid, date: h.todayISO(), quantity: 150, activity_type: 'running', source: 'manual' });

    const restore = await h.forceDay(10);
    try {
      const snap = await h.snapshot();
      await h.runSchedulerJobs();
      const dm = await h.capture(snap, u.tgId);
      const group = await h.capture(snap, GROUP);
      // private challenge-day moment (not budget-capped)
      expect(dm.filter((m) => m.includes('DAYS IN.')).length).toBe(1);
      // collective-distance group post (community crossed 100 KM)
      expect(group.filter((m) => m.includes('WE JUST PASSED 100 KM')).length).toBe(1);
    } finally {
      await restore();
    }
  });
});