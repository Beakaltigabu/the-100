import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { provision, reset, destroy } from './helpers/db-test';
import * as h from './helpers/botHarness';

const { emitProgressEvents, sendActivityConfirm } = require('../src/services/progressEvents');
const { todayISO, addDaysISO } = require('../src/lib/dates');

describe('BOT — private notifications (6 categories, settings-gated, no duplicates)', () => {
  beforeAll(async () => {
    await provision();
  }, 40000);

  beforeEach(async () => {
    await reset();
  }, 20000);

  afterAll(async () => {
    await destroy();
  }, 20000);

  async function activeEnrollment(uid) {
    const ch = await h.getActiveChallenge();
    return h.db('enrollments').where({ user_id: uid, challenge_id: ch.id }).first();
  }

  it('Strava import produces EXACTLY ONE activity-confirmation DM (short)', async () => {
    const u = await h.mkUser({ name: 'Sync', qty: 300 });
    const enrollment = await activeEnrollment(u.uid);
    const snap = await h.snapshot();
    await sendActivityConfirm({ user: { id: u.uid }, enrollment, added: 7.2, total: 307.2 });
    const msgs = await h.capture(snap, u.tgId);
    expect(msgs.filter((m) => m.includes('ACTIVITY LOGGED')).length).toBe(1);
    expect(msgs[0]).toContain('7.2 KM added.');
    expect(msgs[0]).toContain('307.2 / 500 KM');
  });

  it('bot-logged activity does NOT also fire a separate activity-confirm DM', async () => {
    const u = await h.mkUser({ name: 'Inline', qty: 0 });
    const snap = await h.snapshot();
    await h.cb(u.tgId, 'log');
    await h.cb(u.tgId, 'log_type:running');
    await h.cb(u.tgId, 'log_dist:5');
    await h.cb(u.tgId, 'log_date:today');
    await h.cb(u.tgId, 'log_confirm');
    const msgs = await h.capture(snap, u.tgId);
    expect(msgs.filter((m) => m.includes('ACTIVITY LOGGED')).length).toBe(1); // the inline confirm only
  });

  it('milestone celebration: EN DM with buttons, exactly once, gated by milestonesOn', async () => {
    const on = await h.mkUser({ name: 'MilOn', qty: 0 });
    const enOn = await activeEnrollment(on.uid);
    let snap = await h.snapshot();
    await emitProgressEvents({ enrollment: enOn, total: 140, user: { id: on.uid, name: 'MilOn' }, added: 140 });
    let msgs = await h.capture(snap, on.tgId);
    expect(msgs.filter((m) => m.includes('MILESTONE REACHED')).length).toBe(1);
    expect(msgs.join('\n')).toContain('125 KM.');
    const withKb = (await h.captureDetailed(snap, on.tgId)).filter((m) => m.text.includes('MILESTONE REACHED'));
    expect(withKb[0].kb).toBe(true); // SHARE IT / VIEW PROGRESS buttons

    const off = await h.mkUser({ name: 'MilOff', qty: 0 });
    await h.db('bot_settings').insert({ user_id: off.uid, milestones_on: false });
    const enOff = await activeEnrollment(off.uid);
    snap = await h.snapshot();
    await emitProgressEvents({ enrollment: enOff, total: 140, user: { id: off.uid, name: 'MilOff' }, added: 140 });
    msgs = await h.capture(snap, off.tgId);
    expect(msgs.filter((m) => m.includes('MILESTONE REACHED')).length).toBe(0);
  });

  it('challenge-day moment: once per day, skips completed, gated by milestonesOn', async () => {
    const active = await h.mkUser({ name: 'DayOn', qty: 0 });
    const completed = await h.mkUser({ name: 'DayDone', status: 'completed', qty: 500 });
    const off = await h.mkUser({ name: 'DayOff', qty: 0 });
    await h.db('bot_settings').insert({ user_id: off.uid, milestones_on: false });

    const restore = await h.forceDay(10);
    try {
      const snap = await h.snapshot();
      await h.scheduler.checkChallengeDays();
      await h.scheduler.checkChallengeDays(); // second run must not resend
      const a = await h.capture(snap, active.tgId);
      const c = await h.capture(snap, completed.tgId);
      const o = await h.capture(snap, off.tgId);
      expect(a.filter((m) => m.includes('DAYS IN.')).length).toBe(1);
      expect(c.join('\n')).not.toContain('DAYS IN.');
      expect(o.join('\n')).not.toContain('DAYS IN.');
    } finally {
      await restore();
    }
  });

  it('weekly recap: EN recap gated by weeklyOn', async () => {
    const u = await h.mkUser({ name: 'Week', qty: 0 });
    await h.db('challenge_activities').insert({ enrollment_id: u.eid, date: todayISO(), quantity: 12.4, activity_type: 'running', source: 'manual' });
    await h.db('challenge_activities').insert({ enrollment_id: u.eid, date: todayISO(), quantity: 20, activity_type: 'running', source: 'manual' });
    const snap = await h.snapshot();
    await h.scheduler.checkWeekly();
    let msgs = await h.capture(snap, u.tgId);
    // Runs on Mondays (today is 2026-09-28); if not a Monday the job no-ops.
    const monday = new Date(todayISO() + 'T00:00:00').getDay() === 1;
    if (monday) {
      expect(msgs.join('\n')).toContain('YOUR WEEK');
      expect(msgs.join('\n')).toContain('32.4 KM');
    } else {
      expect(msgs).toHaveLength(0);
    }

    const off = await h.mkUser({ name: 'WeekOff', qty: 0 });
    await h.db('bot_settings').insert({ user_id: off.uid, weekly_on: false });
    await h.db('challenge_activities').insert({ enrollment_id: off.eid, date: todayISO(), quantity: 5, activity_type: 'running', source: 'manual' });
    const snap2 = await h.snapshot();
    await h.scheduler.checkWeekly();
    const o = await h.capture(snap2, off.tgId);
    if (monday) expect(o.join('\n')).not.toContain('YOUR WEEK');
  });

  it('re-engagement: EN tone + LOG ACTIVITY button, cooldown, gated by reminders', async () => {
    const u = await h.mkUser({ name: 'Slack', qty: 0 });
    await h.db('challenge_activities').insert({ enrollment_id: u.eid, date: addDaysISO(todayISO(), -8), quantity: 10, activity_type: 'running', source: 'manual' });

    const snap = await h.snapshot();
    await h.scheduler.checkInactivity();
    let msgs = await h.capture(snap, u.tgId);
    expect(msgs.join('\n')).toContain('YOUR 100 IS STILL HERE.');
    expect(msgs.join('\n')).not.toMatch(/missed|behind/);
    const withKb = (await h.captureDetailed(snap, u.tgId)).filter((m) => m.text.includes('STILL HERE'));
    expect(withKb[0].kb).toBe(true); // LOG ACTIVITY button

    // cooldown: second run within 7 days does not resend
    const snap2 = await h.snapshot();
    await h.scheduler.checkInactivity();
    msgs = await h.capture(snap2, u.tgId);
    expect(msgs.join('\n')).not.toContain('STILL HERE');

    // reminders=never → never sends
    const never = await h.mkUser({ name: 'Never', qty: 0 });
    await h.db('bot_settings').insert({ user_id: never.uid, reminders_mode: 'never' });
    await h.db('challenge_activities').insert({ enrollment_id: never.eid, date: addDaysISO(todayISO(), -8), quantity: 10, activity_type: 'running', source: 'manual' });
    const snap3 = await h.snapshot();
    await h.scheduler.checkInactivity();
    msgs = await h.capture(snap3, never.tgId);
    expect(msgs.join('\n')).not.toContain('STILL HERE');
  });

  it('completion: EN card DM with buttons, once', async () => {
    const u = await h.mkUser({ name: 'Finisher', qty: 0 });
    const enrollment = await activeEnrollment(u.uid);
    const snap = await h.snapshot();
    await emitProgressEvents({ enrollment, total: 500, user: { id: u.uid, name: 'Finisher' }, added: 500 });
    const msgs = await h.capture(snap, u.tgId);
    expect(msgs.filter((m) => m.includes('YOU DID THE 100.')).length).toBe(1);
    expect(msgs.join('\n')).toContain('500 KM.');
    const withKb = (await h.captureDetailed(snap, u.tgId)).filter((m) => m.text.includes('YOU DID THE 100.'));
    expect(withKb[0].kb).toBe(true);
    // enrollment flips to completed on the website side
    const after = await h.db('enrollments').where({ id: u.eid }).first();
    expect(after.status).toBe('completed');
  });
});